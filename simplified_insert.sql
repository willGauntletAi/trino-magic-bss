-- Directly insert a minimal record bypassing constraints
-- This is for testing purposes only and not recommended for production

-- Use WITH (TABLOCK) to lock the table during the operation
INSERT INTO dbo.[User] WITH (TABLOCK) 
(
    -- Required fields with hard-coded minimal values
    ID, RoleID, CultureID, LanguageID, OwnerID, Name, 
    Password, CreatedDate, UserStatusTypeID, CreditRatingID, 
    BillGroupID, PasswordLastChangedDate, Current_StatusTypeID, 
    ForcePasswordChangeOnNextLogin, FailedLoginCount, 
    LastUpdateDate, InvoiceConfigurationID, PCISalt, Consented,
    
    -- The field we need for our view (Account)
    Account
)
SELECT 
    9999, 1, 1, 1, 1, 'Test User', 
    'password', GETDATE(), 1, 1, 
    1, GETDATE(), 1, 
    0, 0, 
    GETDATE(), 1, 'salt', 1,
    
    'test.user@example.com'
    
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 9999); 