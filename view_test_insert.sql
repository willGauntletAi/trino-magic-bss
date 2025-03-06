-- SQL script to insert test data that will appear in the Individual view
-- Requirements:
-- 1. UserStatusTypeID = 1 (for "initialized" status)
-- 2. Account IS NOT NULL

-- Begin transaction to ensure data consistency
BEGIN TRANSACTION;

-- Insert record only if it doesn't exist (to avoid duplicates)
IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE Account = 'test_view_user')
BEGIN
    INSERT INTO dbo.[User] (
        UserStatusTypeID,  -- Must be 1 to appear in view
        Account,           -- Must NOT be NULL to appear in view
        Name,              -- Will appear as "formattedName" in view
        CreatedDate,       -- Will be formatted as "status.changeDate"
        -- Other required fields (adjust values as needed for your schema)
        UserTypeID,
        RoleID,
        Password,
        Email,
        IsActive,
        RequirePasswordReset,
        IsLockedOut,
        AuthenticationType,
        DisplayName
    )
    VALUES (
        1,                    -- UserStatusTypeID = 1 (initialized)
        'test_view_user',     -- Account (not null)
        'Test View User',     -- Name
        GETDATE(),            -- CreatedDate
        -- Other required fields' values
        1,                    -- UserTypeID
        1,                    -- RoleID
        'password123',        -- Password
        'test@example.com',   -- Email
        1,                    -- IsActive
        0,                    -- RequirePasswordReset
        0,                    -- IsLockedOut
        0,                    -- AuthenticationType
        'Test User'           -- DisplayName
    );
    
    PRINT 'Test record inserted successfully.';
END
ELSE
BEGIN
    PRINT 'Test record already exists.';
END

-- Commit the transaction
COMMIT;

-- Verify insertion by querying the User table
SELECT * FROM dbo.[User] WHERE Account = 'test_view_user'; 