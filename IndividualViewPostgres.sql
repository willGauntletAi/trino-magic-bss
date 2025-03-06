CREATE OR REPLACE VIEW "Individual" AS
SELECT 
    u."ID" as id,
    u."Name" as name,
    u."Account" as username,
    COALESCE(upans."Value", u."Account") as "legalName",
    u."GivenName" as "givenName",
    u."FamilyName" as "familyName",
    
    -- Status mapping
    CASE WHEN us."Name" = 'Active' THEN 'validated' 
         WHEN us."Name" = 'Inactive' THEN 'initialized'
         ELSE 'initialized' END as status,
    
    -- Credit Rating as array (TMF API format)
    (
        SELECT json_agg(
            json_build_object(
                'creditAgencyName', cr."Name",
                'creditAgencyType', 'Internal',
                'ratingReference', 'CR-' || cr."ID",
                'ratingScore', NULL, -- We don't have an actual credit score in the schema
                'validFor', json_build_object(
                    'startDateTime', u."CreatedDate",
                    'endDateTime', NULL
                )
            )
        )
        FROM "CreditRating" cr
        WHERE cr."ID" = u."CreditRatingID"
    ) as "creditRating",

    -- Contact medium - enhanced with multiple contact types from profile answers
    (
        SELECT json_agg(
            json_build_object(
                'id', 'CM-' || pa."ID",
                'preferred', (CASE WHEN pq."Name" LIKE '%Preferred%' THEN TRUE ELSE FALSE END),
                'contactType', CASE 
                    WHEN pq."Name" LIKE '%Email%' THEN 'email'
                    WHEN pq."Name" LIKE '%Phone%' THEN 'phone'
                    WHEN pq."Name" LIKE '%Address%' THEN 'postalAddress'
                    ELSE pq."Name"
                END,
                'validFor', json_build_object(
                    'startDateTime', u."CreatedDate",
                    'endDateTime', NULL
                ),
                'characteristic', CASE 
                    WHEN pq."Name" LIKE '%Email%' THEN 
                        json_build_object('emailAddress', pa."Value")
                    WHEN pq."Name" LIKE '%Phone%' THEN 
                        json_build_object('phoneNumber', pa."Value")
                    WHEN pq."Name" LIKE '%Address%' THEN 
                        json_build_object('address', pa."Value")
                    ELSE 
                        json_build_object('value', pa."Value")
                END
            )
        )
        FROM "UserAttributeProfileAnswer" upa
        JOIN "ProfileAnswer" pa ON upa."ProfileAnswerID" = pa."ID"
        JOIN "RoleAttributeProfileQuestion" rapq ON upa."RoleAttributeProfileQuestionID" = rapq."ID"
        JOIN "ProfileQuestion" pq ON rapq."ProfileQuestionID" = pq."ID"
        WHERE upa."UserID" = u."ID"
        AND (pq."Name" LIKE '%Email%' OR pq."Name" LIKE '%Phone%' OR pq."Name" LIKE '%Address%')
    ) as "contactMedium",

    -- Language ability with proper language table join
    (
        SELECT json_agg(
            json_build_object(
                'languageCode', l."Code",
                'languageName', l."Name",
                'isFavouriteLanguage', (l."ID" = u."LanguageID"),
                'validFor', json_build_object(
                    'startDateTime', u."CreatedDate",
                    'endDateTime', NULL
                )
            )
        )
        FROM "Language" l
        WHERE l."ID" = u."LanguageID"
    ) as "languageAbility",

    -- Related party - properly formatted for TMF schema
    (
        SELECT json_agg(
            json_build_object(
                'role', CASE r."Name" 
                    WHEN 'Administrator' THEN 'admin'
                    WHEN 'Customer' THEN 'customer'
                    ELSE lower(r."Name")
                END,
                'partyOrPartyRole', json_build_object(
                    'partyId', 'PARTY-' || u."OwnerID",
                    'partyName', o."Name"
                )
            )
        )
        FROM "Role" r
        JOIN "Owner" o ON u."OwnerID" = o."ID"
        WHERE r."ID" = u."RoleID"
    ) as "relatedParty",

    -- Party characteristics - mapped as required by TMF schema
    (
        WITH char_profiles AS (
            SELECT 
                'CHAR-' || upa."ID" as id,
                pq."Name" as name,
                'string' as valuetype,
                pa."Value" as value
            FROM "UserAttributeProfileAnswer" upa
            JOIN "ProfileAnswer" pa ON upa."ProfileAnswerID" = pa."ID"
            JOIN "RoleAttributeProfileQuestion" rapq ON upa."RoleAttributeProfileQuestionID" = rapq."ID"
            JOIN "ProfileQuestion" pq ON rapq."ProfileQuestionID" = pq."ID"
            WHERE upa."UserID" = u."ID"
            AND pq."Name" NOT LIKE '%Email%' 
            AND pq."Name" NOT LIKE '%Phone%' 
            AND pq."Name" NOT LIKE '%Address%'
        ),
        credit_limit AS (
            SELECT 
                'CHAR-CREDIT-LIMIT' as id,
                'Credit Limit' as name,
                'money' as valuetype,
                cu."CreditLimit"::text as value
            FROM "_Ribbon_UserCreditUsage" cu
            WHERE cu."UserID" = u."ID"
        ),
        credit_used AS (
            SELECT 
                'CHAR-CREDIT-USED' as id,
                'Credit Used' as name,
                'money' as valuetype,
                cu."CreditUsed"::text as value
            FROM "_Ribbon_UserCreditUsage" cu
            WHERE cu."UserID" = u."ID"
        ),
        credit_percentage AS (
            SELECT 
                'CHAR-CREDIT-PERCENTAGE' as id,
                'Credit Usage Percentage' as name,
                'percentage' as valuetype,
                cu."PercentageUsed"::text as value
            FROM "_Ribbon_UserCreditUsage" cu
            WHERE cu."UserID" = u."ID"
        ),
        all_characteristics AS (
            SELECT * FROM char_profiles
            UNION ALL SELECT * FROM credit_limit
            UNION ALL SELECT * FROM credit_used
            UNION ALL SELECT * FROM credit_percentage
        )
        SELECT json_agg(
            json_build_object(
                'id', id,
                'name', name,
                'valueType', valuetype,
                'value', value
            )
        )
        FROM all_characteristics
    ) as "partyCharacteristic",

    -- Audit fields
    u."CreatedDate" as "birthDate",
    NULL as "deathDate",

    -- External Reference - for other systems
    (
        SELECT json_agg(
            json_build_object(
                'owner', o."Name",
                'externalIdentifierType', 'EngageIP',
                'id', u."ID"::text
            )
        )
        FROM "Owner" o
        WHERE o."ID" = u."OwnerID"
    ) as "externalReference"

FROM "User" u
LEFT JOIN "UserStatusType" us ON u."UserStatusTypeID" = us."ID"
LEFT JOIN "UserAttributeProfileAnswer" upans_q ON u."ID" = upans_q."UserID" 
    AND upans_q."RoleAttributeProfileQuestionID" IN (
        SELECT rapq."ID" 
        FROM "RoleAttributeProfileQuestion" rapq 
        JOIN "ProfileQuestion" pq ON rapq."ProfileQuestionID" = pq."ID"
        WHERE pq."Name" LIKE '%Legal Name%'
    )
LEFT JOIN "ProfileAnswer" upans ON upans_q."ProfileAnswerID" = upans."ID"; 