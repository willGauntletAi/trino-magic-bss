-- Simple SQL Server data insertion
-- Disable constraint checking and just insert the minimal data we need

-- Temporarily disable constraint checking
ALTER DATABASE EngageIPRibbonPartnerBilling SET ALLOW_SNAPSHOT_ISOLATION ON;
BEGIN TRANSACTION;

-- Insert User records with minimal fields
SET IDENTITY_INSERT dbo.[User] ON;
INSERT INTO dbo.[User] (ID, Account, Name, UserStatusTypeID, CreatedDate)
SELECT 101, 'john.doe@example.com', 'John Doe', 1, GETDATE() 
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 101);

INSERT INTO dbo.[User] (ID, Account, Name, UserStatusTypeID, CreatedDate)
SELECT 102, 'jane.smith@example.com', 'Jane Smith', 1, GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 102);

INSERT INTO dbo.[User] (ID, Account, Name, UserStatusTypeID, CreatedDate)
SELECT 103, 'robert.johnson@example.com', 'Robert Johnson', 1, GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 103);

INSERT INTO dbo.[User] (ID, Account, Name, UserStatusTypeID, CreatedDate)
SELECT 104, 'maria.garcia@example.com', 'Maria Garcia', 1, GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 104);

INSERT INTO dbo.[User] (ID, Account, Name, UserStatusTypeID, CreatedDate)
SELECT 105, 'james.wilson@example.com', 'James Wilson', 1, GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 105);

INSERT INTO dbo.[User] (ID, Account, Name, UserStatusTypeID, CreatedDate)
SELECT 106, 'inactive.user@example.com', 'Inactive User', 2, GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ID = 106);
SET IDENTITY_INSERT dbo.[User] OFF;

COMMIT;
ALTER DATABASE EngageIPRibbonPartnerBilling SET ALLOW_SNAPSHOT_ISOLATION OFF;

-- Note: Record with ID=106 has UserStatusTypeID=2 so it should not appear in the view
-- The other 5 records should appear in the view since they have UserStatusTypeID=1 and Account is not null 