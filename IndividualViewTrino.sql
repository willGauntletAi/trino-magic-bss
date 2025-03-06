CREATE OR REPLACE VIEW memory.default."Individual" AS
SELECT 
    CAST(u.ID AS VARCHAR) AS id,
    'Individual' AS "@type",
    
    -- Base Fields
    u.Account AS "name",
    CAST(NULL AS VARCHAR) AS "tradingName",
    CAST(NULL AS VARCHAR) AS "nameType",
    u.Name AS "formattedName",
    CAST(u.CreatedDate AS VARCHAR) AS "status.changeDate",
    CASE WHEN u.UserStatusTypeID = 1 THEN 'initialized' ELSE 'terminated' END AS "status.value",
    
    -- Party Characteristics (simplified to static JSON strings)
    '[]' AS "partyCharacteristic",
    
    -- Credit Rating (simplified to static JSON string)
    '[]' AS "creditRating",
    
    -- Contact Medium (simplified to static JSON string)
    '[]' AS "contactMedium",
    
    -- Other required fields with no direct mapping
    CAST(NULL AS VARCHAR) AS "birthDate",
    CAST(NULL AS VARCHAR) AS "deathDate",
    CAST(NULL AS VARCHAR) AS "nationality",
    CAST(NULL AS VARCHAR) AS "maritalStatus",
    CAST(NULL AS VARCHAR) AS "gender",
    'individual' AS "individualType",
    
    -- Related Party (simplified to static JSON string)
    '[]' AS "relatedParty",
    
    -- External References (simplified to static JSON string)
    '[]' AS "externalReference"
    
FROM sqlserver.dbo."User" u
WHERE u.UserStatusTypeID = 1
AND u.Account IS NOT NULL 