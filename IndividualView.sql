CREATE VIEW Individual AS
SELECT 
    u.ID as id,
    u.Name as name,
    u.Account as username,
    COALESCE(upans.Value, u.Account) as legalName,
    u.GivenName as givenName,
    u.FamilyName as familyName,
    
    -- Status mapping
    CASE WHEN us.Name = 'Active' THEN 'validated' 
         WHEN us.Name = 'Inactive' THEN 'initialized'
         ELSE 'initialized' END as status,
    
    -- Credit Rating as array (TMF API format)
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'creditAgencyName', cr.Name,
                'creditAgencyType', 'Internal',
                'ratingReference', CONCAT('CR-', cr.ID),
                'ratingScore', NULL, -- We don't have an actual credit score in the schema
                'validFor', JSON_OBJECT(
                    'startDateTime', u.CreatedDate,
                    'endDateTime', NULL
                )
            )
        )
        FROM CreditRating cr
        WHERE cr.ID = u.CreditRatingID
    ) as creditRating,

    -- Contact medium - enhanced with multiple contact types from profile answers
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', CONCAT('CM-', pa.ID),
                'preferred', (CASE WHEN pq.Name LIKE '%Preferred%' THEN TRUE ELSE FALSE END),
                'contactType', CASE 
                    WHEN pq.Name LIKE '%Email%' THEN 'email'
                    WHEN pq.Name LIKE '%Phone%' THEN 'phone'
                    WHEN pq.Name LIKE '%Address%' THEN 'postalAddress'
                    ELSE pq.Name
                END,
                'validFor', JSON_OBJECT(
                    'startDateTime', u.CreatedDate,
                    'endDateTime', NULL
                ),
                'characteristic', CASE 
                    WHEN pq.Name LIKE '%Email%' THEN 
                        JSON_OBJECT('emailAddress', pa.Value)
                    WHEN pq.Name LIKE '%Phone%' THEN 
                        JSON_OBJECT('phoneNumber', pa.Value)
                    WHEN pq.Name LIKE '%Address%' THEN 
                        JSON_OBJECT('address', pa.Value)
                    ELSE 
                        JSON_OBJECT('value', pa.Value)
                END
            )
        )
        FROM UserAttributeProfileAnswer upa
        JOIN ProfileAnswer pa ON upa.ProfileAnswerID = pa.ID
        JOIN RoleAttributeProfileQuestion rapq ON upa.RoleAttributeProfileQuestionID = rapq.ID
        JOIN ProfileQuestion pq ON rapq.ProfileQuestionID = pq.ID
        WHERE upa.UserID = u.ID
        AND (pq.Name LIKE '%Email%' OR pq.Name LIKE '%Phone%' OR pq.Name LIKE '%Address%')
    ) as contactMedium,

    -- Language ability with proper language table join
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'languageCode', l.Code,
                'languageName', l.Name,
                'isFavouriteLanguage', (l.ID = u.LanguageID),
                'validFor', JSON_OBJECT(
                    'startDateTime', u.CreatedDate,
                    'endDateTime', NULL
                )
            )
        )
        FROM Language l
        WHERE l.ID = u.LanguageID
    ) as languageAbility,

    -- Related party - properly formatted for TMF schema
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'role', CASE r.Name 
                    WHEN 'Administrator' THEN 'admin'
                    WHEN 'Customer' THEN 'customer'
                    ELSE LOWER(r.Name)
                END,
                'partyOrPartyRole', JSON_OBJECT(
                    'partyId', CONCAT('PARTY-', u.OwnerID),
                    'partyName', o.Name
                )
            )
        )
        FROM Role r
        JOIN Owner o ON u.OwnerID = o.ID
        WHERE r.ID = u.RoleID
    ) as relatedParty,

    -- Party characteristics - mapped as required by TMF schema
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', CONCAT('CHAR-', upa.ID),
                'name', pq.Name,
                'valueType', 'string',
                'value', pa.Value
            )
        )
        FROM UserAttributeProfileAnswer upa
        JOIN ProfileAnswer pa ON upa.ProfileAnswerID = pa.ID
        JOIN RoleAttributeProfileQuestion rapq ON upa.RoleAttributeProfileQuestionID = rapq.ID
        JOIN ProfileQuestion pq ON rapq.ProfileQuestionID = pq.ID
        WHERE upa.UserID = u.ID
        AND pq.Name NOT LIKE '%Email%' 
        AND pq.Name NOT LIKE '%Phone%' 
        AND pq.Name NOT LIKE '%Address%'
        
        UNION ALL
        
        -- Add credit usage information as party characteristics
        SELECT JSON_OBJECT(
            'id', 'CHAR-CREDIT-LIMIT',
            'name', 'Credit Limit',
            'valueType', 'money',
            'value', CAST(cu.CreditLimit as VARCHAR(50))
        )
        FROM _Ribbon_UserCreditUsage cu
        WHERE cu.UserID = u.ID
        
        UNION ALL
        
        SELECT JSON_OBJECT(
            'id', 'CHAR-CREDIT-USED',
            'name', 'Credit Used',
            'valueType', 'money',
            'value', CAST(cu.CreditUsed as VARCHAR(50))
        )
        FROM _Ribbon_UserCreditUsage cu
        WHERE cu.UserID = u.ID
        
        UNION ALL
        
        SELECT JSON_OBJECT(
            'id', 'CHAR-CREDIT-PERCENTAGE',
            'name', 'Credit Usage Percentage',
            'valueType', 'percentage',
            'value', CAST(cu.PercentageUsed as VARCHAR(10))
        )
        FROM _Ribbon_UserCreditUsage cu
        WHERE cu.UserID = u.ID
    ) as partyCharacteristic,

    -- Audit fields
    u.CreatedDate as birthDate,
    NULL as deathDate,

    -- External Reference - for other systems
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'owner', o.Name,
                'externalIdentifierType', 'EngageIP',
                'id', CAST(u.ID as VARCHAR(50))
            )
        )
        FROM Owner o
        WHERE o.ID = u.OwnerID
    ) as externalReference

FROM [User] u
LEFT JOIN UserStatusType us ON u.UserStatusTypeID = us.ID
LEFT JOIN UserAttributeProfileAnswer upans_q ON u.ID = upans_q.UserID 
    AND upans_q.RoleAttributeProfileQuestionID IN (
        SELECT rapq.ID 
        FROM RoleAttributeProfileQuestion rapq 
        JOIN ProfileQuestion pq ON rapq.ProfileQuestionID = pq.ID
        WHERE pq.Name LIKE '%Legal Name%'
    )
LEFT JOIN ProfileAnswer upans ON upans_q.ProfileAnswerID = upans.ID;