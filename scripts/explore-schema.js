const fs = require('fs');
const path = require('path');
const sql = require('mssql');

async function exploreUserSchema() {
    const outputFile = path.join(__dirname, 'schema_exploration.txt');
    
    // Create/clear the output file at the start
    fs.writeFileSync(outputFile, '');
    console.log(`Created clean output file: ${outputFile}`);

    const config = {
        server: 'logisense.chvaiwx1ayel.us-east-2.rds.amazonaws.com',
        database: 'EngageIPRibbonPartnerBilling',
        user: 'admin',
        password: 'admin123',
        options: {
            encrypt: false,
            trustServerCertificate: true
        }
    };

    // Function to write to both console and file
    const log = (message) => {
        console.log(message);
        fs.appendFileSync(outputFile, message + '\n');
    };

    try {
        log('Connecting to SQL Server...');
        await sql.connect(config);

        // Enhanced helper function to get table columns with more metadata
        async function getTableColumns(tableName) {
            const result = await sql.query`
                SELECT 
                    c.COLUMN_NAME as name,
                    c.DATA_TYPE as type,
                    c.IS_NULLABLE as nullable,
                    c.CHARACTER_MAXIMUM_LENGTH as maxLength,
                    COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as isIdentity,
                    (
                        SELECT COUNT(*)
                        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
                        WHERE k.TABLE_SCHEMA = c.TABLE_SCHEMA
                        AND k.TABLE_NAME = c.TABLE_NAME
                        AND k.COLUMN_NAME = c.COLUMN_NAME
                        AND k.CONSTRAINT_NAME LIKE 'PK%'
                    ) as isPrimaryKey
                FROM INFORMATION_SCHEMA.COLUMNS c
                WHERE c.TABLE_SCHEMA = 'dbo'
                AND c.TABLE_NAME = ${tableName}
                ORDER BY c.ORDINAL_POSITION
            `;
            return result.recordset;
        }

        // Enhanced helper function to get foreign key relationships with additional metadata
        async function getForeignKeys(tableName) {
            // Get foreign keys with additional constraint information
            const fkQuery = await sql.query`
                SELECT 
                    OBJECT_NAME(f.parent_object_id) AS ReferencingTable,
                    COL_NAME(fc.parent_object_id, fc.parent_column_id) AS ReferencingColumn,
                    OBJECT_NAME(f.referenced_object_id) AS ReferencedTable,
                    COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS ReferencedColumn,
                    f.name AS ConstraintName,
                    f.delete_referential_action AS DeleteAction,
                    f.update_referential_action AS UpdateAction
                FROM sys.foreign_keys AS f
                INNER JOIN sys.foreign_key_columns AS fc
                    ON f.object_id = fc.constraint_object_id
                WHERE (OBJECT_SCHEMA_NAME(f.parent_object_id) = 'dbo'
                    AND OBJECT_NAME(f.parent_object_id) = ${tableName})
                    OR (OBJECT_SCHEMA_NAME(f.referenced_object_id) = 'dbo'
                    AND OBJECT_NAME(f.referenced_object_id) = ${tableName})
            `;
            return fkQuery.recordset;
        }

        // Get table indexes
        async function getTableIndexes(tableName) {
            const result = await sql.query`
                SELECT 
                    i.name AS IndexName,
                    STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS Columns,
                    i.is_unique AS IsUnique,
                    i.is_primary_key AS IsPrimaryKey
                FROM sys.indexes i
                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                WHERE OBJECT_SCHEMA_NAME(i.object_id) = 'dbo'
                AND OBJECT_NAME(i.object_id) = ${tableName}
                GROUP BY i.name, i.is_unique, i.is_primary_key
            `;
            return result.recordset;
        }

        // Set to keep track of explored tables and their relationships
        const exploredTables = new Set();
        const relationships = new Map();
        
        // Enhanced recursive function to explore table relationships
        async function exploreTableRelationships(tableName, depth = 0, maxDepth = 4, path = []) {
            if (depth >= maxDepth || exploredTables.has(tableName)) {
                return;
            }
            
            exploredTables.add(tableName);
            path.push(tableName);
            
            // Get table metadata
            const columns = await getTableColumns(tableName);
            const foreignKeys = await getForeignKeys(tableName);
            const indexes = await getTableIndexes(tableName);
            
            // Start table structure section
            log('\n' + '='.repeat(80));
            log(`Table: ${tableName} (Depth: ${depth})`);
            log(`Path: ${path.join(' -> ')}`);
            log('-'.repeat(80));
            
            // Log columns with enhanced metadata
            log('Columns:');
            const columnStrings = columns.map(col => {
                const typeInfo = col.maxLength ? `${col.type}(${col.maxLength})` : col.type;
                const flags = [
                    col.isPrimaryKey ? 'PK' : '',
                    col.isIdentity ? 'Identity' : '',
                    col.nullable === 'YES' ? 'NULL' : 'NOT NULL'
                ].filter(Boolean).join(', ');
                return `  ${col.name.padEnd(30)} ${typeInfo.padEnd(15)} ${flags}`;
            });
            log(columnStrings.join('\n'));
            
            // Log indexes
            if (indexes.length > 0) {
                log('\nIndexes:');
                indexes.forEach(idx => {
                    const type = idx.IsPrimaryKey ? 'PRIMARY KEY' : (idx.IsUnique ? 'UNIQUE' : 'INDEX');
                    log(`  ${idx.IndexName} (${type}): ${idx.Columns}`);
                });
            }
            
            // Log relationships with enhanced metadata
            if (foreignKeys.length > 0) {
                log('\nRelationships:');
                const relationshipsByTable = {};
                foreignKeys.forEach(fk => {
                    const key = fk.ReferencedTable === tableName ? 
                        `Referenced by ${fk.ReferencingTable}` : 
                        `References ${fk.ReferencedTable}`;
                    if (!relationshipsByTable[key]) {
                        relationshipsByTable[key] = [];
                    }
                    const actionInfo = fk.DeleteAction > 0 ? ` (ON DELETE CASCADE)` : '';
                    relationshipsByTable[key].push(
                        `  ${fk.ReferencingColumn} -> ${fk.ReferencedColumn}${actionInfo}`
                    );
                    
                    // Store relationship in the map
                    const relKey = `${fk.ReferencingTable}->${fk.ReferencedTable}`;
                    if (!relationships.has(relKey)) {
                        relationships.set(relKey, {
                            from: fk.ReferencingTable,
                            to: fk.ReferencedTable,
                            columns: []
                        });
                    }
                    relationships.get(relKey).columns.push({
                        from: fk.ReferencingColumn,
                        to: fk.ReferencedColumn
                    });
                });
                
                Object.entries(relationshipsByTable).forEach(([tableRelation, columns]) => {
                    log(`\n${tableRelation}:`);
                    log(columns.join('\n'));
                });
            }
            
            // Explore related tables
            for (const fk of foreignKeys) {
                const nextTable = fk.ReferencingTable === tableName ? 
                    fk.ReferencedTable : fk.ReferencingTable;
                if (!path.includes(nextTable)) {
                    await exploreTableRelationships(nextTable, depth + 1, maxDepth, [...path]);
                }
            }
            
            path.pop();
        }

        // Start exploration from the user table
        await exploreTableRelationships('user', 0, 4);
        
        // Log relationship summary
        log('\nRelationship Summary:');
        for (const [key, rel] of relationships) {
            log(`\n${rel.from} -> ${rel.to}`);
            rel.columns.forEach(col => {
                log(`  ${col.from} -> ${col.to}`);
            });
        }
        
        log('\nSchema exploration completed.');

    } catch (error) {
        const errorMessage = `Error exploring schema: ${error.message}\n${error.stack}`;
        log(errorMessage);
    } finally {
        await sql.close();
    }
}

// First install mssql if not already installed
const { execSync } = require('child_process');
try {
    require.resolve('mssql');
} catch (e) {
    console.log('Installing mssql package...');
    execSync('npm install mssql', { stdio: 'inherit' });
}

// Run the exploration
exploreUserSchema().catch(error => {
    console.error('Top-level error:', error);
    fs.appendFileSync(path.join(__dirname, 'schema_exploration.txt'), '\nTop-level error: ' + error.message + '\n' + error.stack);
}); 