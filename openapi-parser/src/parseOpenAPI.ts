import SwaggerParser from '@apidevtools/swagger-parser';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAPI, OpenAPIV3 } from 'openapi-types';

// Define interface for endpoint output
interface Endpoint {
    operationId: string;
    path: string;
    method: string;
}

// Define interface for a schema field
interface SchemaField {
    name: string;
    type: string;
    format?: string;
    description?: string;
    required?: boolean;
    enum?: string[];
    items?: SchemaField;
    properties?: { [key: string]: SchemaField };
    additionalProperties?: boolean | SchemaField;
    oneOf?: SchemaField[];
}

// Define interface for a complete schema type
interface SchemaType {
    name: string;
    description?: string;
    fields: { [key: string]: SchemaField };
    required?: string[];
    oneOf?: SchemaType[]; // Add support for oneOf variants
}

// Define interface for an endpoint group with a tag
interface TaggedEndpointGroup {
    tableName: string; // CamelCase version of the tag name for database table naming
    endpoints: Endpoint[];
    underlyingType?: string; // Schema type extracted from retrieve endpoint 200 response
    schema?: SchemaType; // Detailed schema information
}

// Define interface for grouped endpoints output
interface GroupedEndpoints {
    [tag: string]: TaggedEndpointGroup;
}

// Define a type for HTTP methods
type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head';

/**
 * Main function to parse OpenAPI specs and extract endpoints
 * @param {string} inputDir - Directory containing OpenAPI specs
 * @param {string} outputFile - Output JSON file path
 */
async function parseOpenAPISpecifications(
    inputDir: string,
    outputFile: string = 'endpoints.json'
): Promise<void> {
    try {
        // Find all JSON and YAML files in the input directory
        const files = await glob(`${inputDir}/**/*.{json,yaml,yml}`);

        if (files.length === 0) {
            console.error(`No OpenAPI specification files found in ${inputDir}`);
            process.exit(1);
        }

        console.log(`Found ${files.length} OpenAPI specification files`);

        // Object to store endpoints grouped by tag
        const groupedEndpoints: GroupedEndpoints = {};

        // Process each file
        for (const file of files) {
            try {
                console.log(`Processing ${file}...`);

                // Parse the OpenAPI spec
                const api = await SwaggerParser.parse(file) as OpenAPI.Document;

                // Extract endpoints
                const endpoints = extractEndpoints(api);

                // Add endpoints to grouped structure
                addToGroupedEndpoints(groupedEndpoints, endpoints, api);

                console.log(`Extracted ${endpoints.length} endpoints from ${file}`);
            } catch (err) {
                console.error(`Error processing ${file}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // Write endpoints to output file
        fs.writeFileSync(outputFile, JSON.stringify(groupedEndpoints, null, 2));

        // Count total endpoints for reporting
        const totalEndpoints = Object.values(groupedEndpoints)
            .reduce((sum, taggedGroup) => sum + taggedGroup.endpoints.length, 0);

        console.log(`Successfully extracted ${totalEndpoints} endpoints to ${outputFile}`);
    } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

/**
 * Convert a string to PascalCase (UpperCamelCase) with no spaces
 * @param {string} str - The string to convert
 * @returns {string} - The PascalCase string with original casing preserved
 */
function toCamelCase(str: string): string {
    // Handle empty string
    if (!str) return '';

    // Replace non-alphanumeric characters with spaces
    let sanitized = str.replace(/[^a-zA-Z0-9 ]/g, ' ');

    // Split by spaces and other separators
    return sanitized
        .split(/[\s-_]+/)
        .map((word) => {
            // Capitalize only the first letter of each word, preserve original casing for the rest
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join('');
}

/**
 * Check if a tag should be excluded based on heuristics
 * @param {string} tag - The tag name to check
 * @returns {boolean} - True if the tag should be excluded, false otherwise
 */
function shouldExcludeTag(tag: string): boolean {
    const lowercaseTag = tag.toLowerCase();
    // Exclude event subscriptions, notification listeners, and client-side notification listeners
    return (
        lowercaseTag.includes('events subscription') ||
        lowercaseTag.includes('eventsubscription') ||
        lowercaseTag.includes('notification listener') ||
        lowercaseTag.includes('notificationlistener') ||
        lowercaseTag.includes('notification listeners (client side)') ||
        lowercaseTag.includes('client side notification')
    );
}

/**
 * Get the operation details for an endpoint
 * @param {Endpoint} endpoint - The endpoint to get operation details for
 * @param {OpenAPI.Document} api - The OpenAPI document
 * @returns {OpenAPI.Operation | undefined} - The operation details, or undefined if not found
 */
function getOperation(endpoint: Endpoint, api: OpenAPI.Document): OpenAPI.Operation | undefined {
    const pathItem = api.paths?.[endpoint.path];
    if (!pathItem) return undefined;

    const method = endpoint.method.toLowerCase() as HttpMethod;
    return pathItem[method] as OpenAPI.Operation;
}

/**
 * Add endpoints to the grouped endpoints object
 * @param {GroupedEndpoints} groupedEndpoints - The grouped endpoints object to add to
 * @param {Endpoint[]} endpoints - The list of endpoints to add
 * @param {OpenAPI.Document} api - The OpenAPI document
 */
function addToGroupedEndpoints(
    groupedEndpoints: GroupedEndpoints,
    endpoints: Endpoint[],
    api: OpenAPI.Document
): void {
    for (const endpoint of endpoints) {
        const tags = findTagsForEndpoint(endpoint, api);

        if (tags.length === 0) {
            // Skip endpoints without tags
            continue;
        }

        for (const tag of tags) {
            // Skip excluded tags
            if (shouldExcludeTag(tag)) {
                continue;
            }

            if (!groupedEndpoints[tag]) {
                // Create a new group for this tag
                groupedEndpoints[tag] = {
                    tableName: toCamelCase(tag),
                    endpoints: []
                };
            }

            // Check if this endpoint already exists in the group
            const isDuplicate = groupedEndpoints[tag].endpoints.some(existingEndpoint =>
                existingEndpoint.path === endpoint.path &&
                existingEndpoint.method === endpoint.method
            );

            // Only add the endpoint if it's not a duplicate
            if (!isDuplicate) {
                groupedEndpoints[tag].endpoints.push(endpoint);
            }
        }
    }

    // After grouping, extract the underlying type for each group
    for (const tag in groupedEndpoints) {
        const group = groupedEndpoints[tag];
        const endpoints = group.endpoints;

        // Look for a GET endpoint that retrieves a single resource
        let typeInfo: { typeName?: string, schema?: SchemaType } = {};
        for (const endpoint of endpoints) {
            if (endpoint.method.toLowerCase() === 'get') {
                const operation = getOperation(endpoint, api);
                if (operation) {
                    typeInfo = extractTypeSchema(operation, api);
                    if (typeInfo.typeName) {
                        break;
                    }
                }
            }
        }

        if (typeInfo.typeName) {
            group.underlyingType = typeInfo.typeName;
            group.schema = typeInfo.schema;
        }
    }
}

/**
 * Find tags for a specific endpoint
 * @param {Endpoint} endpoint - The endpoint to find tags for
 * @param {OpenAPI.Document} api - The OpenAPI document to search in
 * @returns {string[]} - Array of tags for this endpoint
 */
function findTagsForEndpoint(endpoint: Endpoint, api: OpenAPI.Document): string[] {
    const paths = api.paths || {};
    const pathItem = paths[endpoint.path];

    if (!pathItem) return [];

    const operation = pathItem[endpoint.method as keyof typeof pathItem] as OpenAPI.Operation;

    if (!operation) return [];

    return operation.tags || [];
}

/**
 * Extract endpoints from an OpenAPI Document
 * @param {OpenAPI.Document} api - Parsed OpenAPI document
 * @returns {Endpoint[]} - Array of endpoints
 */
function extractEndpoints(api: OpenAPI.Document): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const paths = api.paths || {};

    // Iterate through each path
    for (const [path, pathItem] of Object.entries(paths)) {
        if (!pathItem) continue;

        // Iterate through HTTP methods
        const methods: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

        for (const method of methods) {
            // Type guard to ensure method exists on pathItem
            if (pathItem[method] && typeof pathItem[method] === 'object') {
                const operation = pathItem[method] as OpenAPI.Operation;

                if (operation) {
                    // Get operationId or generate one if it doesn't exist
                    const operationId = operation.operationId || generateOperationId(path, method);

                    const endpoint: Endpoint = {
                        operationId,
                        path,
                        method,
                    };

                    endpoints.push(endpoint);
                }
            }
        }
    }

    return endpoints;
}

/**
 * Generate an operationId if none is provided in the spec
 * @param {string} path - Endpoint path
 * @param {string} method - HTTP method
 * @returns {string} - Generated operationId
 */
function generateOperationId(path: string, method: string): string {
    // Convert path to camelCase
    const pathParts = path
        .replace(/[{}]/g, '')
        .split('/')
        .filter(Boolean)
        .map((part, index) =>
            index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
        );

    return `${method}${pathParts.join('')}`;
}

/**
 * Extract the underlying type and full schema for a retrieve operation
 * @param {OpenAPI.Operation} operation - The OpenAPI operation
 * @param {OpenAPI.Document} api - The OpenAPI document
 * @returns {SchemaType | undefined} - The extracted schema type or undefined
 */
function extractTypeSchema(operation: OpenAPI.Operation, api: OpenAPI.Document): { typeName?: string, schema?: SchemaType } {
    if (!operation.responses) {
        return {};
    }

    // Look for 200 response
    const response = operation.responses['200'];
    if (!response) {
        return {};
    }

    // Resolve reference if needed
    let resolvedResponse: OpenAPIV3.ResponseObject;
    if ('$ref' in response) {
        const resolved = resolveReference(response.$ref, api, new Set());
        if (!resolved || !('content' in resolved)) {
            return {};
        }
        resolvedResponse = resolved as OpenAPIV3.ResponseObject;
    } else {
        resolvedResponse = response as OpenAPIV3.ResponseObject;
    }

    // Check for schema in content
    if (resolvedResponse.content) {
        const jsonContent = resolvedResponse.content['application/json'];
        if (jsonContent && jsonContent.schema) {
            const result = handleSchema(jsonContent.schema, api);
            if (result.schema) {
                return result;
            }
        }
    }

    return {};
}

// Helper function to handle schema processing
function handleSchema(schema: any, doc: any, visitedRefs: Set<string> = new Set()): { typeName?: string, schema?: SchemaType } {
    if (!schema) {
        return {};
    }

    // Handle array types
    if (schema.type === 'array' && schema.items) {
        const itemSchema = schema.items.$ref ? resolveReference(schema.items.$ref, doc, visitedRefs) : schema.items;
        const result = handleSchema(itemSchema, doc, new Set(visitedRefs));
        if (result.schema) {
            return {
                typeName: `Array<${result.typeName || 'any'}>`,
                schema: {
                    name: `Array<${result.schema.name}>`,
                    fields: {
                        items: {
                            name: 'items',
                            type: 'array',
                            items: {
                                name: result.schema.name,
                                type: 'object',
                                properties: result.schema.fields
                            }
                        }
                    }
                }
            };
        }
    }

    // Handle references
    if (schema.$ref) {
        // Get the type name from the reference
        const typeName = extractTypeFromRef(schema.$ref);

        // If we've already visited this reference, return a reference type
        if (visitedRefs.has(schema.$ref)) {
            return {
                typeName,
                schema: {
                    name: typeName || 'Object',
                    description: `Reference to ${typeName}`,
                    fields: {},
                    required: []
                }
            };
        }

        // Add to visited refs
        visitedRefs.add(schema.$ref);

        // Resolve the reference
        const resolvedSchema = resolveReference(schema.$ref, doc, visitedRefs);
        if (!resolvedSchema) {
            return {
                typeName,
                schema: {
                    name: typeName || 'Object',
                    description: `Unable to resolve reference to ${typeName}`,
                    fields: {},
                    required: []
                }
            };
        }

        // Process the resolved schema
        const result = handleSchema(resolvedSchema, doc, visitedRefs);
        if (result.schema) {
            return {
                typeName,
                schema: {
                    ...result.schema,
                    name: typeName || result.schema.name
                }
            };
        }
    }

    // Handle allOf composition (inheritance)
    if (schema.allOf && Array.isArray(schema.allOf)) {
        const schemaType: SchemaType = {
            name: schema.title || 'Object',
            description: schema.description,
            fields: {},
            required: schema.required || []
        };

        // Process each allOf schema
        for (const subSchema of schema.allOf) {
            let resolvedSubSchema = subSchema;

            // If it's a reference, resolve it first
            if (subSchema.$ref) {
                // Skip if we've already visited this reference
                if (visitedRefs.has(subSchema.$ref)) continue;

                resolvedSubSchema = resolveReference(subSchema.$ref, doc, visitedRefs);
                if (!resolvedSubSchema) continue;

                // Add to visited refs
                visitedRefs.add(subSchema.$ref);
            }

            // Process the resolved subschema
            const subResult = handleSchema(resolvedSubSchema, doc, visitedRefs);
            if (subResult.schema) {
                // Merge fields from the subschema
                Object.assign(schemaType.fields, subResult.schema.fields);

                // Merge required fields
                if (subResult.schema.required) {
                    schemaType.required = [...(schemaType.required || []), ...subResult.schema.required];
                }
            }
        }

        // Process properties directly defined in the schema
        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries<any>(schema.properties)) {
                const field = extractSchemaField(propName, propSchema, doc, visitedRefs);
                if (field) {
                    schemaType.fields[propName] = field;
                }
            }
        }

        return {
            typeName: schema.title,
            schema: schemaType
        };
    }

    // Handle direct object schemas
    if (schema.type === 'object' || (!schema.type && schema.properties)) {
        const schemaType: SchemaType = {
            name: schema.title || 'Object',
            description: schema.description,
            fields: {},
            required: schema.required || []
        };

        // Process properties
        if (schema.properties) {
            for (const [key, value] of Object.entries<any>(schema.properties)) {
                const field = extractSchemaField(key, value, doc, visitedRefs);
                if (field) {
                    schemaType.fields[key] = field;
                }
            }
        }

        return {
            typeName: schema.title,
            schema: schemaType
        };
    }

    return {};
}

/**
 * Extract a complete schema type from a resolved schema object
 * @param {string} name - The name of the schema type
 * @param {any} schema - The schema object
 * @param {OpenAPI.Document} api - The full OpenAPI document (for resolving references)
 * @param {Set<string>} visitedRefs - Set of already visited references to prevent infinite recursion
 * @returns {SchemaType} - The extracted schema type
 */
function extractSchemaType(name: string, schema: any, api: OpenAPI.Document, visitedRefs: Set<string> = new Set()): SchemaType {
    const schemaType: SchemaType = {
        name,
        description: schema.description,
        fields: {},
        required: schema.required || []
    };

    // Handle allOf composition (inheritance)
    if (schema.allOf && Array.isArray(schema.allOf)) {
        for (const subSchema of schema.allOf) {
            let resolvedSubSchema = subSchema;

            // If it's a reference, resolve it first
            if (subSchema.$ref) {
                // Skip if we've already visited this reference
                if (visitedRefs.has(subSchema.$ref)) continue;

                resolvedSubSchema = resolveReference(subSchema.$ref, api, visitedRefs);
                if (!resolvedSubSchema) continue;

                // Add to visited refs
                visitedRefs.add(subSchema.$ref);
            }

            // Handle nested allOf compositions recursively
            if (resolvedSubSchema.allOf) {
                const nestedType = extractSchemaType(`${name}_nested`, resolvedSubSchema, api, visitedRefs);
                Object.assign(schemaType.fields, nestedType.fields);
                if (nestedType.required && nestedType.required.length > 0) {
                    schemaType.required = [...(schemaType.required || []), ...nestedType.required];
                }
            }

            // Handle properties in the subschema
            if (resolvedSubSchema.properties) {
                for (const [propName, propSchema] of Object.entries<any>(resolvedSubSchema.properties)) {
                    schemaType.fields[propName] = extractSchemaField(propName, propSchema, api, visitedRefs);
                }

                // Merge required fields
                if (resolvedSubSchema.required && Array.isArray(resolvedSubSchema.required)) {
                    schemaType.required = [...(schemaType.required || []), ...resolvedSubSchema.required];
                }
            }
        }
    }

    // Handle oneOf at the schema level
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
        schemaType.oneOf = schema.oneOf.map((variant: any, index: number) => {
            if (variant.$ref) {
                // Skip if we've already visited this reference
                if (visitedRefs.has(variant.$ref)) {
                    return {
                        name: `${name}_variant_${index}`,
                        description: `Reference to ${extractTypeFromRef(variant.$ref)}`,
                        fields: {},
                        required: []
                    };
                }

                const resolvedVariant = resolveReference(variant.$ref, api, visitedRefs);
                if (!resolvedVariant) {
                    return {
                        name: `${name}_variant_${index}`,
                        description: `Unable to resolve reference`,
                        fields: {},
                        required: []
                    };
                }

                // Add to visited refs
                visitedRefs.add(variant.$ref);

                const variantName = extractTypeFromRef(variant.$ref) || `${name}_variant_${index}`;
                return extractSchemaType(variantName, resolvedVariant, api, visitedRefs);
            }
            return extractSchemaType(`${name}_variant_${index}`, variant, api, visitedRefs);
        });
    }

    // Process properties directly defined in the schema
    if (schema.properties) {
        for (const [propName, propSchema] of Object.entries<any>(schema.properties)) {
            schemaType.fields[propName] = extractSchemaField(propName, propSchema, api, visitedRefs);
        }
    }

    // Remove duplicates from required array
    if (schemaType.required && schemaType.required.length > 0) {
        schemaType.required = [...new Set(schemaType.required)];
    }

    return schemaType;
}

/**
 * Extract a schema field from a property schema
 * @param {string} name - The name of the field
 * @param {any} propSchema - The property schema
 * @param {OpenAPI.Document} api - The full OpenAPI document (for resolving references)
 * @param {Set<string>} visitedRefs - Set of already visited references to prevent infinite recursion
 * @returns {SchemaField} - The extracted schema field with expanded references
 */
function extractSchemaField(name: string, propSchema: any, api: OpenAPI.Document, visitedRefs: Set<string> = new Set()): SchemaField {
    // If it's a reference, resolve it and recursively process
    if (propSchema.$ref) {
        // Check if we've already visited this reference
        if (visitedRefs.has(propSchema.$ref)) {
            // Return a reference type with basic schema info
            const typeName = extractTypeFromRef(propSchema.$ref);
            return {
                name,
                type: 'object',
                description: `Reference to ${typeName}`
            };
        }

        // Add this reference to visited set
        visitedRefs.add(propSchema.$ref);

        const resolvedSchema = resolveReference(propSchema.$ref, api, visitedRefs);
        if (!resolvedSchema) {
            // If reference can't be resolved, return minimal field info
            return {
                name,
                type: 'object',
                description: `Unable to resolve reference to ${extractTypeFromRef(propSchema.$ref)}`
            };
        }

        // Create a base field with the name and reference info
        const field: SchemaField = {
            name,
            type: resolvedSchema.type || 'object',
            description: resolvedSchema.description
        };

        // Include format if available
        if (resolvedSchema.format) field.format = resolvedSchema.format;

        // Include enum if available
        if (resolvedSchema.enum) field.enum = resolvedSchema.enum;

        // Handle properties for objects
        if (resolvedSchema.properties) {
            field.properties = {};
            for (const [subPropName, subPropSchema] of Object.entries<any>(resolvedSchema.properties)) {
                field.properties[subPropName] = extractSchemaField(subPropName, subPropSchema, api, visitedRefs);
            }
        }

        // Handle oneOf cases
        if (resolvedSchema.oneOf && Array.isArray(resolvedSchema.oneOf)) {
            field.oneOf = resolvedSchema.oneOf.map((variant: any, index: number) =>
                extractSchemaField(`${name}_variant_${index}`, variant, api, visitedRefs)
            );
            field.type = 'union';
        }

        // Handle allOf composition
        if (resolvedSchema.allOf && Array.isArray(resolvedSchema.allOf)) {
            if (!field.properties) field.properties = {};

            for (const subSchema of resolvedSchema.allOf) {
                let subSchemaResolved = subSchema;

                if (subSchema.$ref) {
                    if (visitedRefs.has(subSchema.$ref)) continue;
                    subSchemaResolved = resolveReference(subSchema.$ref, api, visitedRefs);
                    if (!subSchemaResolved) continue;
                    visitedRefs.add(subSchema.$ref);
                }

                if (subSchemaResolved.properties) {
                    for (const [subPropName, subPropSchema] of Object.entries<any>(subSchemaResolved.properties)) {
                        field.properties[subPropName] = extractSchemaField(subPropName, subPropSchema, api, visitedRefs);
                    }
                }
            }
        }

        // Handle items for arrays
        if (resolvedSchema.type === 'array' && resolvedSchema.items) {
            field.items = extractSchemaField('items', resolvedSchema.items, api, visitedRefs);
        }

        // Handle additionalProperties
        if (resolvedSchema.additionalProperties) {
            if (typeof resolvedSchema.additionalProperties === 'object') {
                field.additionalProperties = extractSchemaField('additionalProperties', resolvedSchema.additionalProperties, api, visitedRefs);
            } else {
                field.additionalProperties = resolvedSchema.additionalProperties as boolean;
            }
        }

        return field;
    }

    // Handle non-reference schemas
    const field: SchemaField = {
        name,
        type: propSchema.type || 'object',
        description: propSchema.description
    };

    // Include format if available
    if (propSchema.format) field.format = propSchema.format;

    // Include enum if available
    if (propSchema.enum) field.enum = propSchema.enum;

    // Handle oneOf cases
    if (propSchema.oneOf && Array.isArray(propSchema.oneOf)) {
        field.oneOf = propSchema.oneOf.map((variant: any, index: number) =>
            extractSchemaField(`${name}_variant_${index}`, variant, api, visitedRefs)
        );
        field.type = 'union';
    }

    // Handle nested objects (properties)
    if (propSchema.type === 'object' && propSchema.properties) {
        field.properties = {};
        for (const [subPropName, subPropSchema] of Object.entries<any>(propSchema.properties)) {
            field.properties[subPropName] = extractSchemaField(subPropName, subPropSchema, api, visitedRefs);
        }
    }

    // Handle arrays (items)
    if (propSchema.type === 'array' && propSchema.items) {
        field.items = extractSchemaField('items', propSchema.items, api, visitedRefs);
    }

    // Handle additionalProperties
    if (propSchema.additionalProperties) {
        if (typeof propSchema.additionalProperties === 'object') {
            field.additionalProperties = extractSchemaField('additionalProperties', propSchema.additionalProperties, api, visitedRefs);
        } else {
            field.additionalProperties = propSchema.additionalProperties as boolean;
        }
    }

    return field;
}

/**
 * Resolve a reference in the OpenAPI document
 * @param {string} ref - The reference path (e.g. "#/components/schemas/Pet")
 * @param {OpenAPI.Document} api - The OpenAPI document
 * @param {Set<string>} [visitedRefs] - Set of already visited references to prevent infinite recursion
 * @returns {any} - The resolved reference or undefined
 */
function resolveReference(ref: string, api: OpenAPI.Document, visitedRefs: Set<string> = new Set()): any {
    if (!ref || typeof ref !== 'string') {
        console.warn('Invalid reference:', ref);
        return undefined;
    }

    // Handle only internal references for now
    if (!ref.startsWith('#/')) {
        console.warn('External references not supported:', ref);
        return undefined;
    }

    // Split the reference path and navigate through the API document
    const parts = ref.substring(2).split('/');
    let current: any = api;

    try {
        for (const part of parts) {
            if (!current || typeof current !== 'object' || !(part in current)) {
                console.warn(`Could not resolve reference part '${part}' in path: ${ref}`);
                return undefined;
            }
            current = current[part];
        }

        // If we've already visited this reference, return the schema as is to break the recursion
        if (visitedRefs.has(ref)) {
            console.warn('Circular reference detected:', ref);
            return current;
        }

        // Add this reference to visited set
        visitedRefs.add(ref);

        // If the resolved reference contains another reference, resolve it
        if (current && typeof current === 'object' && current.$ref) {
            return resolveReference(current.$ref, api, visitedRefs);
        }

        return current;
    } catch (error) {
        console.error('Error resolving reference:', ref, error);
        return undefined;
    }
}

/**
 * Extract the type name from a schema reference
 * @param {string} ref - The schema reference path
 * @returns {string|undefined} - The extracted type name or undefined
 */
function extractTypeFromRef(ref: string): string | undefined {
    if (!ref || typeof ref !== 'string') return undefined;

    // Extract the last part of the reference path which is typically the type name
    const parts = ref.split('/');
    return parts[parts.length - 1];
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('Usage: npm run parse -- <input-directory> [output-file]');
    process.exit(1);
}

const inputDir = args[0];
const outputFile = args[1] || 'endpoints.json';

// Execute the parser
parseOpenAPISpecifications(inputDir, outputFile)
    .catch(err => {
        console.error('An error occurred:', err instanceof Error ? err.message : String(err));
        process.exit(1);
    });