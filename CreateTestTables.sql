-- Create minimal schema to test the Individual view
CREATE TABLE "User" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL,
    "Account" varchar(255) NOT NULL,
    "GivenName" varchar(255),
    "FamilyName" varchar(255),
    "UserStatusTypeID" int,
    "CreditRatingID" int,
    "LanguageID" int,
    "RoleID" int,
    "OwnerID" int,
    "CreatedDate" timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserStatusType" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL
);

CREATE TABLE "CreditRating" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL,
    "OwnerID" int NOT NULL,
    "SortOrder" int,
    "Terms" varchar(255)
);

CREATE TABLE "Language" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL,
    "Code" varchar(10) NOT NULL
);

CREATE TABLE "Role" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL
);

CREATE TABLE "Owner" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL
);

CREATE TABLE "_Ribbon_UserCreditUsage" (
    "UserID" int NOT NULL,
    "UserName" varchar(255) NOT NULL,
    "OwnerID" int,
    "CreditLimit" decimal(18,2),
    "CreditUsed" decimal(18,2),
    "PercentageUsed" int
);

CREATE TABLE "ProfileQuestion" (
    "ID" serial PRIMARY KEY,
    "Name" varchar(255) NOT NULL
);

CREATE TABLE "RoleAttributeProfileQuestion" (
    "ID" serial PRIMARY KEY,
    "ProfileQuestionID" int,
    "RoleID" int
);

CREATE TABLE "ProfileAnswer" (
    "ID" serial PRIMARY KEY,
    "ProfileQuestionID" int,
    "Value" varchar(1000)
);

CREATE TABLE "UserAttributeProfileAnswer" (
    "ID" serial PRIMARY KEY,
    "UserID" int,
    "ProfileAnswerID" int,
    "RoleAttributeProfileQuestionID" int
);

-- Insert sample data
INSERT INTO "UserStatusType" ("ID", "Name") VALUES (1, 'Active'), (2, 'Inactive');
INSERT INTO "CreditRating" ("ID", "Name", "OwnerID", "SortOrder", "Terms") VALUES 
(1, 'Excellent', 1, 1, 'Net 30'),
(2, 'Good', 1, 2, 'Net 15'),
(3, 'Fair', 1, 3, 'Net 7');

INSERT INTO "Language" ("ID", "Name", "Code") VALUES 
(1, 'English', 'en-US'),
(2, 'Spanish', 'es-ES');

INSERT INTO "Role" ("ID", "Name") VALUES 
(1, 'Administrator'),
(2, 'Customer');

INSERT INTO "Owner" ("ID", "Name") VALUES 
(1, 'Engage Telecom');

-- Create some sample users
INSERT INTO "User" ("ID", "Name", "Account", "GivenName", "FamilyName", "UserStatusTypeID", "CreditRatingID", "LanguageID", "RoleID", "OwnerID") VALUES
(1, 'John Smith', 'jsmith', 'John', 'Smith', 1, 1, 1, 2, 1),
(2, 'Jane Doe', 'jdoe', 'Jane', 'Doe', 1, 2, 1, 2, 1),
(3, 'Admin User', 'admin', 'Admin', 'User', 1, 3, 1, 1, 1);

-- Add credit usage data
INSERT INTO "_Ribbon_UserCreditUsage" ("UserID", "UserName", "OwnerID", "CreditLimit", "CreditUsed", "PercentageUsed") VALUES
(1, 'jsmith', 1, 5000.00, 1250.00, 25),
(2, 'jdoe', 1, 2500.00, 1750.00, 70),
(3, 'admin', 1, 10000.00, 500.00, 5);

-- Add profile questions
INSERT INTO "ProfileQuestion" ("ID", "Name") VALUES
(1, 'Email Address'),
(2, 'Phone Number'),
(3, 'Mailing Address'),
(4, 'Preferred Email'),
(5, 'Legal Name'),
(6, 'Occupation'),
(7, 'Company');

-- Connect questions to roles
INSERT INTO "RoleAttributeProfileQuestion" ("ID", "ProfileQuestionID", "RoleID") VALUES
(1, 1, 2),
(2, 2, 2),
(3, 3, 2),
(4, 4, 2),
(5, 5, 2),
(6, 6, 2),
(7, 7, 2);

-- Add profile answers
INSERT INTO "ProfileAnswer" ("ID", "ProfileQuestionID", "Value") VALUES
(1, 1, 'john.smith@example.com'),
(2, 2, '555-123-4567'),
(3, 3, '123 Main St, Anytown, USA'),
(4, 4, 'john.smith@example.com'),
(5, 5, 'Jonathan Smith Jr.'),
(6, 1, 'jane.doe@example.com'),
(7, 2, '555-987-6543'),
(8, 6, 'Software Engineer'),
(9, 7, 'Tech Corp');

-- Connect answers to users
INSERT INTO "UserAttributeProfileAnswer" ("ID", "UserID", "ProfileAnswerID", "RoleAttributeProfileQuestionID") VALUES
(1, 1, 1, 1),
(2, 1, 2, 2),
(3, 1, 3, 3),
(4, 1, 4, 4),
(5, 1, 5, 5),
(6, 2, 6, 1),
(7, 2, 7, 2),
(8, 1, 8, 6),
(9, 1, 9, 7); 