import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface Endpoint {
    operationId: string;
    path: string;
    method: string;
}

interface TaggedEndpointGroup {
    tableName: string;
    endpoints: Endpoint[];
    underlyingType?: string;
    schema?: any;
}

interface EndpointsData {
    [tag: string]: TaggedEndpointGroup;
}

interface RouteInfo {
    routeKey: string;
    path: string;
    method: string;
    occurrences: {
        tag: string;
        operationId: string;
    }[];
}

/**
 * Validates the endpoints.json file and identifies duplicated routes
 * @param jsonFilePath Path to the endpoints.json file
 * @returns List of duplicated routes
 */
function findDuplicatedRoutes(jsonFilePath: string): RouteInfo[] {
    // Read and parse the endpoints.json file
    const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
    const endpointsData: EndpointsData = JSON.parse(fileContent);

    // Map to track all routes and their occurrences
    const routeMap: Map<string, RouteInfo> = new Map();

    // Iterate through all tags and their endpoints
    for (const tag in endpointsData) {
        const tagGroup = endpointsData[tag];

        for (const endpoint of tagGroup.endpoints) {
            // Create a unique key for each route (path + method)
            const routeKey = `${endpoint.path}:${endpoint.method.toLowerCase()}`;

            if (!routeMap.has(routeKey)) {
                routeMap.set(routeKey, {
                    routeKey,
                    path: endpoint.path,
                    method: endpoint.method.toLowerCase(),
                    occurrences: []
                });
            }

            // Add this occurrence to the route info
            const routeInfo = routeMap.get(routeKey)!;
            routeInfo.occurrences.push({
                tag,
                operationId: endpoint.operationId
            });
        }
    }

    // Filter for routes that appear more than once
    const duplicatedRoutes: RouteInfo[] = [];
    for (const routeInfo of routeMap.values()) {
        if (routeInfo.occurrences.length > 1) {
            duplicatedRoutes.push(routeInfo);
        }
    }

    return duplicatedRoutes;
}

/**
 * Main function to validate the endpoints.json file
 */
function validateEndpoints(filePath?: string): void {
    // Default to endpoints.json in the current directory if not specified
    const endpointsJsonPath = filePath || path.join(process.cwd(), 'endpoints.json');

    try {
        console.log(`Validating endpoints file: ${endpointsJsonPath}`);

        // Find duplicated routes
        const duplicatedRoutes = findDuplicatedRoutes(endpointsJsonPath);

        // Output the results
        if (duplicatedRoutes.length === 0) {
            console.log('No duplicated routes found!');
        } else {
            console.log(`Found ${duplicatedRoutes.length} duplicated routes:`);
            console.log('-------------------------------------');

            for (const route of duplicatedRoutes) {
                console.log(`Path: ${route.path}, Method: ${route.method.toUpperCase()}`);
                console.log('Appears in:');

                for (const occurrence of route.occurrences) {
                    console.log(`  - Tag: "${occurrence.tag}", OperationId: "${occurrence.operationId}"`);
                }

                console.log('-------------------------------------');
            }
        }
    } catch (error) {
        console.error('Error validating endpoints file:', error);
    }
}

// Check if this file is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
    // Check if a file path was provided as a command line argument
    const filePath = process.argv[2];
    validateEndpoints(filePath);
}

export { validateEndpoints, findDuplicatedRoutes }; 