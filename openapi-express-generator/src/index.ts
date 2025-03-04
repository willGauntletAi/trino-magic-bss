#!/usr/bin/env node

import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Command } from 'commander';
import * as Handlebars from 'handlebars';
import { OpenAPIV3 } from 'openapi-types';
import * as _ from 'lodash';
import dotenv from 'dotenv';

// Define types for our generator
interface GeneratorOptions {
    specPath: string;
    outputDir: string;
    force: boolean;
}

// Define a more specific type for the OpenAPI document
interface OpenAPIDocument extends OpenAPIV3.Document {
    components?: {
        schemas?: Record<string, any>;
        [key: string]: any;
    };
    [key: string]: any;
}

class OpenAPIExpressGenerator {
    private program: Command;

    constructor() {
        this.program = new Command();
        this.setupCommands();
    }

    private setupCommands(): void {
        this.program
            .name('openapi-express-generator')
            .description('Generate Express server code from OpenAPI specification')
            .version('1.0.0');

        this.program
            .command('generate')
            .description('Generate Express server from OpenAPI spec')
            .requiredOption('-s, --spec <path>', 'Path to OpenAPI specification file (JSON or YAML)')
            .option('-o, --output <dir>', 'Output directory', './output')
            .option('-f, --force', 'Overwrite existing files', false)
            .action(async (options) => {
                try {
                    await this.generateServer({
                        specPath: options.spec,
                        outputDir: options.output,
                        force: options.force
                    });
                } catch (error) {
                    console.error('Error generating server:', error);
                    process.exit(1);
                }
            });
    }

    private async generateServer(options: GeneratorOptions): Promise<void> {
        console.log(`Generating Express server from ${options.specPath}...`);

        // Validate and parse OpenAPI spec
        let parsedSpec: OpenAPIDocument;
        try {
            parsedSpec = await SwaggerParser.dereference(options.specPath) as OpenAPIDocument;
            // Validate spec
            await SwaggerParser.validate(options.specPath);
        } catch (error) {
            console.error('Error parsing OpenAPI specification:', error);
            throw error;
        }

        // Prepare output directory
        if (fs.existsSync(options.outputDir)) {
            if (!options.force) {
                throw new Error(`Output directory ${options.outputDir} already exists. Use --force to overwrite.`);
            }
        } else {
            fs.mkdirSync(options.outputDir, { recursive: true });
        }

        // Generate server code
        await this.generateServerCode(parsedSpec, options.outputDir);

        console.log(`Express server generated successfully in ${options.outputDir}`);
    }

    private async generateServerCode(spec: OpenAPIDocument, outputDir: string): Promise<void> {
        // Create directory structure
        fs.mkdirSync(path.join(outputDir, 'src', 'routes'), { recursive: true });
        fs.mkdirSync(path.join(outputDir, 'src', 'controllers'), { recursive: true });
        fs.mkdirSync(path.join(outputDir, 'src', 'models'), { recursive: true });
        fs.mkdirSync(path.join(outputDir, 'src', 'middleware'), { recursive: true });

        // Generate package.json
        await this.generatePackageJson(outputDir);

        // Generate tsconfig.json
        await this.generateTsConfig(outputDir);

        // Generate main server file
        await this.generateMainServerFile(spec, outputDir);

        // Generate routes
        await this.generateRoutes(spec, outputDir);

        // Generate controllers
        await this.generateControllers(spec, outputDir);

        // Generate models
        if (spec.components && spec.components.schemas) {
            await this.generateModels(spec.components.schemas, outputDir);
        }

        // Generate middleware
        await this.generateMiddleware(outputDir);

        // Generate README
        await this.generateReadme(spec, outputDir);

        // Create utilities directory and Trino utility file
        fs.mkdirSync(path.join(outputDir, 'src', 'utils'), { recursive: true });

        // Copy the utility template files
        const trinoUtilTemplate = fs.readFileSync(
            path.join(__dirname, 'templates', 'utils', 'trino-util.ts.template'),
            'utf-8'
        );
        fs.writeFileSync(path.join(outputDir, 'src', 'utils', 'trino-util.ts'), trinoUtilTemplate);

        // Copy the API utilities template
        const apiUtilTemplate = fs.readFileSync(
            path.join(__dirname, 'templates', 'utils', 'api-utils.ts.template'),
            'utf-8'
        );
        fs.writeFileSync(path.join(outputDir, 'src', 'utils', 'api-utils.ts'), apiUtilTemplate);

        // Create .env file with Trino configuration
        const envTemplate = fs.readFileSync(
            path.join(__dirname, 'templates', 'env.template'),
            'utf-8'
        );
        fs.writeFileSync(path.join(outputDir, '.env'), envTemplate);
        fs.writeFileSync(path.join(outputDir, '.env.example'), envTemplate);
    }

    private async generatePackageJson(outputDir: string): Promise<void> {
        const packageJson = {
            name: 'openapi-express-server',
            version: '1.0.0',
            description: 'Express server generated from OpenAPI specification',
            main: 'dist/index.js',
            scripts: {
                start: 'node dist/index.js',
                dev: 'ts-node-dev --respawn --transpile-only src/index.ts',
                build: 'tsc',
                test: 'jest'
            },
            type: 'commonjs',
            dependencies: {
                express: '^4.18.2',
                'cors': '^2.8.5',
                'body-parser': '^1.20.2',
                'helmet': '^7.0.0',
                'morgan': '^1.10.0',
                'winston': '^3.10.0',
                'dotenv': '^16.0.3',
                'trino-client': '^0.2.6'
            },
            devDependencies: {
                '@types/express': '^4.17.17',
                '@types/cors': '^2.8.13',
                '@types/morgan': '^1.9.4',
                '@types/node': '^20.5.0',
                'ts-node': '^10.9.1',
                'ts-node-dev': '^2.0.0',
                'typescript': '^5.1.6',
                'jest': '^29.6.2',
                '@types/jest': '^29.5.3',
                'ts-jest': '^29.1.1',
                'supertest': '^6.3.3',
                '@types/supertest': '^2.0.12'
            }
        };

        fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    }

    private async generateTsConfig(outputDir: string): Promise<void> {
        const tsConfig = {
            compilerOptions: {
                target: 'es2020',
                module: 'commonjs',
                outDir: './dist',
                rootDir: './src',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true,
                resolveJsonModule: true
            },
            include: ['src/**/*'],
            exclude: ['node_modules', '**/*.test.ts']
        };

        fs.writeFileSync(path.join(outputDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
    }

    private async generateMainServerFile(spec: OpenAPIDocument, outputDir: string): Promise<void> {
        // A simple Express server template
        const serverTemplate = `
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { registerRoutes } from './routes';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app: Application = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Register API routes
registerRoutes(app);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// Start server
app.listen(port, () => {
  console.log(\`Server is running on port \${port}\`);
});

export default app;
`.trim();

        fs.writeFileSync(path.join(outputDir, 'src', 'index.ts'), serverTemplate);
    }

    private async generateRoutes(spec: OpenAPIDocument, outputDir: string): Promise<void> {
        console.log("Generating routes...");
        const indexContent: string[] = [];

        // Create routes directory
        fs.mkdirSync(path.join(outputDir, 'src', 'routes'), { recursive: true });

        // Group paths by tag
        const pathsByTag: { [tag: string]: { path: string; method: string; operationId: string }[] } = {};

        // Iterate over all paths in the OpenAPI spec
        for (const [path, pathObj] of Object.entries(spec.paths || {})) {
            for (const [method, methodObj] of Object.entries(pathObj || {})) {
                if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                    continue; // Skip non-standard methods
                }

                // Cast to OperationObject to access properties
                const operation = methodObj as OpenAPIV3.OperationObject;

                // Skip if there's no operationId
                if (!operation.operationId) {
                    console.warn(`Skipping ${method.toUpperCase()} ${path} - no operationId`);
                    continue;
                }

                // Get the first tag, if available
                const tag = operation.tags && operation.tags.length > 0 ? operation.tags[0] : 'default';

                // Initialize the tag's array if it doesn't exist
                if (!pathsByTag[tag]) {
                    pathsByTag[tag] = [];
                }

                // Express path params use :paramName instead of {paramName}
                const expressPath = path.replace(/{([^}]+)}/g, ':$1');

                // Add the path to the tag's array
                pathsByTag[tag].push({
                    path: expressPath,
                    method,
                    operationId: operation.operationId
                });
            }
        }

        // Create a route file for each tag
        for (const [tag, paths] of Object.entries(pathsByTag)) {
            // Normalize the tag name for file names - convert to lowercase
            const tagFileName = tag.toLowerCase();

            // Normalize the tag name for variable names - convert spaces to underscores
            const normalizedTagName = tag.replace(/\s+/g, '_');

            let routeFileContent = `import { Application, Request, Response, NextFunction } from 'express';\n`;
            routeFileContent += `import * as controllers from '../controllers/${tagFileName}';\n\n`;

            routeFileContent += `export function register(app: Application): void {\n`;

            for (const { path, method, operationId } of paths) {
                // Convert path to lowercase for Express routes except for path parameters
                const expressPath = path
                    .split('/')
                    .map(segment => segment.startsWith(':') ? segment : segment.toLowerCase())
                    .join('/');

                routeFileContent += `  app.${method}('${expressPath}', async (req: Request, res: Response, next: NextFunction) => {\n`;
                routeFileContent += `    try {\n`;
                // Updated to use the full operationId from the spec
                routeFileContent += `      const result = await controllers.${operationId}(req, res);\n`;
                routeFileContent += `      return result;\n`;
                routeFileContent += `    } catch (error) {\n`;
                routeFileContent += `      next(error);\n`;
                routeFileContent += `    }\n`;
                routeFileContent += `  });\n`;
            }

            routeFileContent += `}\n`;

            // Write the route file
            fs.writeFileSync(path.join(outputDir, 'src', 'routes', `${tagFileName.replace(/\s+/g, '')}.ts`), routeFileContent);

            // Add the route import to the index using the normalized tag name in the import statement
            indexContent.push(`import { register as register${this.capitalizeFirstLetter(normalizedTagName)} } from './${tagFileName.replace(/\s+/g, '')}';`);
        }

        // Create index file that registers all routes
        let routeIndexTemplate = `import { Application } from 'express';\n`;
        for (const importLine of indexContent) {
            routeIndexTemplate += importLine + '\n';
        }

        routeIndexTemplate += `\nexport function registerRoutes(app: Application): void {\n`;
        for (const [tag, _] of Object.entries(pathsByTag)) {
            // Use the normalized tag name in the function call
            const normalizedTagName = tag.replace(/\s+/g, '_');
            routeIndexTemplate += `  register${this.capitalizeFirstLetter(normalizedTagName)}(app);\n`;
        }
        routeIndexTemplate += `}\n`;

        fs.writeFileSync(path.join(outputDir, 'src', 'routes', 'index.ts'), routeIndexTemplate);
    }

    private async generateControllers(spec: OpenAPIDocument, outputDir: string): Promise<void> {
        console.log("Generating controllers...");

        // Group operations by tag
        const operationsByTag: { [tag: string]: any[] } = {};

        // First pass: collect operations
        if (spec.paths) {
            for (const [pathName, pathItem] of Object.entries(spec.paths)) {
                for (const [method, operation] of Object.entries(pathItem || {})) {
                    if (['get', 'post', 'put', 'delete', 'patch'].includes(method) && operation) {
                        const op = operation as OpenAPIV3.OperationObject;

                        // Skip operations without operationId
                        if (!op.operationId) {
                            console.warn(`Warning: Operation without operationId at ${method.toUpperCase()} ${pathName}`);
                            continue;
                        }

                        const tag = op.tags?.[0] || 'default';

                        // Initialize the tag in operationsByTag if not already done
                        if (!operationsByTag[tag]) {
                            operationsByTag[tag] = [];
                        }

                        operationsByTag[tag].push({
                            path: pathName.replace(/{(\w+)}/g, ':$1'), // Convert {param} to :param for Express
                            method,
                            operationId: op.operationId,
                            summary: op.summary || `${method.toUpperCase()} ${pathName}`,
                            description: op.description,
                            isRetrieveOperation: method === 'get' && pathName.includes('{id}')
                        });
                    }
                }
            }
        }

        // Create table name mapping for each tag
        const tableNameByTag: { [tag: string]: string } = {};

        // Use tag name with first letter capitalized
        for (const tag of Object.keys(operationsByTag)) {
            const capitalizedTag = tag.charAt(0).toUpperCase() + tag.slice(1);
            console.log(`[DEBUG] Creating table name mapping for tag "${tag}" -> "${capitalizedTag}"`);
            tableNameByTag[tag] = capitalizedTag;
        }

        console.log("[DEBUG] Final table name mappings:", tableNameByTag);
        console.log("Generating server code...");

        // Load the non-GET operations template once
        const nonGetTemplateContent = fs.readFileSync(
            path.join(__dirname, 'templates', 'controller-non-get.ts.template'),
            'utf-8'
        );

        // Register Handlebars helpers
        Handlebars.registerHelper('eq', function (arg1: any, arg2: any) {
            return arg1 === arg2;
        });

        Handlebars.registerHelper('ifeq', function (this: any, arg1: any, arg2: any, options: any) {
            return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
        });

        Handlebars.registerHelper('neq', function (arg1: any, arg2: any) {
            return arg1 !== arg2;
        });

        // Generate controller files
        for (const [tag, operations] of Object.entries(operationsByTag)) {
            // Separate GET operations
            const getOperations = operations.filter(op => op.method === 'get');
            const nonGetOperations = operations.filter(op => op.method !== 'get');

            let controllerContent = '';

            // Read in GET operations from templates with Trino implementation 
            for (const op of getOperations) {
                const resourceName = this.capitalizeFirstLetter(tag);
                // Use the table name from our mapping
                const tableName = tableNameByTag[tag];
                console.log(`[DEBUG] Processing GET operation for tag "${tag}":
                  - Original tag: "${tag}"
                  - Table name from mapping: "${tableName}"
                  - Resource name: "${resourceName}"
                  - Operation path: "${op.path}"`);

                try {
                    const templateContent = fs.readFileSync(
                        path.join(__dirname, 'templates', 'controller-get.ts.template'),
                        'utf-8'
                    );

                    // Create template data
                    const templateData = {
                        resourceName,
                        tableName,
                        operationId: op.operationId,
                        summary: op.summary || (op.path.includes(':id') ?
                            `Retrieve ${resourceName} by ID` : `List ${resourceName} objects`),
                        isList: !op.path.includes(':id'), // true for list operations, false for retrieve
                        resourcePath: op.path.replace(/:[^/]+/g, '').replace(/\/+$/, '') // Path with param placeholders removed and trailing slashes trimmed
                    };

                    // Compile and process template
                    const template = Handlebars.compile(templateContent);
                    const processedTemplate = template(templateData);

                    // For the first GET operation, keep the imports; for others, strip them
                    if (controllerContent === '') {
                        controllerContent += processedTemplate;
                    } else {
                        // Strip imports from the beginning of the template for subsequent operations
                        const functionsStartIndex = processedTemplate.indexOf('export async function');
                        if (functionsStartIndex > 0) {
                            controllerContent += processedTemplate.substring(functionsStartIndex);
                        } else {
                            controllerContent += processedTemplate;
                        }
                    }
                } catch (error: any) {
                    console.error(`Error processing template for ${op.operationId}:`, error);
                    throw new Error(`Failed to generate controller function for ${op.operationId}: ${error.message}`);
                }
            }

            // Process non-GET operations
            if (nonGetOperations.length > 0) {
                try {
                    const template = Handlebars.compile(nonGetTemplateContent);
                    controllerContent += template({ operations: nonGetOperations });
                } catch (error: any) {
                    console.error(`Error processing non-GET operations template for tag ${tag}:`, error);
                    throw new Error(`Failed to generate non-GET controller functions for tag ${tag}: ${error.message}`);
                }
            }

            // Create the controller file
            const tagFileName = tag.toLowerCase().replace(/\s+/g, '');

            // Write controller file with all the generated functions
            fs.writeFileSync(
                path.join(outputDir, 'src', 'controllers', `${tagFileName}.ts`),
                controllerContent
            );
        }
    }

    // Helper function to capitalize first letter of a string
    private capitalizeFirstLetter(string: string): string {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    private async generateModels(schemas: any, outputDir: string): Promise<void> {
        // Generate TypeScript interfaces from OpenAPI schemas
        for (const [schemaName, schema] of Object.entries(schemas)) {
            const modelContent = this.generateModelInterface(schemaName, schema);
            fs.writeFileSync(
                path.join(outputDir, 'src', 'models', `${_.kebabCase(schemaName)}.ts`),
                modelContent
            );
        }

        // Generate an index file for models
        const modelNames = Object.keys(schemas);
        const indexContent = modelNames
            .map(name => `export * from './${_.kebabCase(name)}';`)
            .join('\n');

        fs.writeFileSync(path.join(outputDir, 'src', 'models', 'index.ts'), indexContent);
    }

    private generateModelInterface(name: string, schema: any): string {
        // A simple approach - in a real implementation this would be more robust
        let result = `/**
 * ${schema.description || `Interface for ${name}`}
 */
export interface ${name} {
`;

        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                const isRequired = schema.required?.includes(propName);
                const typescriptType = this.getTypeScriptType(propSchema as any);
                const description = (propSchema as any).description;

                // Handle special property names that need to be wrapped in quotes
                const formattedPropName = propName.match(/^[@$]|[-.+\s]/) ?
                    `'${propName}'` : propName;

                if (description) {
                    result += `  /** ${description} */\n`;
                }

                result += `  ${formattedPropName}${isRequired ? '' : '?'}: ${typescriptType};\n`;
            }
        }

        result += '}\n';
        return result;
    }

    private getTypeScriptType(schema: any): string {
        if (!schema) return 'any';

        if (schema.$ref) {
            // Extract the name from the reference
            const refParts = schema.$ref.split('/');
            return refParts[refParts.length - 1];
        }

        switch (schema.type) {
            case 'integer':
            case 'number':
                return 'number';
            case 'string':
                if (schema.format === 'date-time' || schema.format === 'date') {
                    return 'Date';
                }
                return 'string';
            case 'boolean':
                return 'boolean';
            case 'array':
                const itemsType = schema.items ? this.getTypeScriptType(schema.items) : 'any';
                return `${itemsType}[]`;
            case 'object':
                if (schema.additionalProperties) {
                    const valueType = this.getTypeScriptType(schema.additionalProperties);
                    return `Record<string, ${valueType}>`;
                }
                return 'Record<string, any>';
            default:
                return 'any';
        }
    }

    private async generateMiddleware(outputDir: string): Promise<void> {
        // Generate auth middleware
        const authMiddlewareContent = `
import { Request, Response, NextFunction } from 'express';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // TODO: Implement authentication logic here
  // This is a placeholder implementation
  next();
}

export function authorize(roles: string[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // TODO: Implement authorization logic here
    // This is a placeholder implementation
    next();
  };
}
`.trim();

        // Generate validation middleware
        const validationMiddlewareContent = `
import { Request, Response, NextFunction } from 'express';

export function validateRequest(schema: any): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // TODO: Implement request validation logic here
    // This is a placeholder implementation
    next();
  };
}
`.trim();

        // Generate error handling middleware
        const errorMiddlewareContent = `
import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error(err.stack);
  
  // Handle different types of errors
  if (err.name === 'ValidationError') {
    res.status(400).json({
      message: 'Validation Error',
      details: err.message
    });
    return;
  }
  
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      message: 'Unauthorized',
      details: err.message
    });
    return;
  }
  
  // Default error handler
  res.status(500).json({
    message: 'Internal Server Error',
    details: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
}
`.trim();

        fs.writeFileSync(path.join(outputDir, 'src', 'middleware', 'auth.ts'), authMiddlewareContent);
        fs.writeFileSync(path.join(outputDir, 'src', 'middleware', 'validation.ts'), validationMiddlewareContent);
        fs.writeFileSync(path.join(outputDir, 'src', 'middleware', 'error.ts'), errorMiddlewareContent);

        // Generate middleware index file
        const indexContent = `
export * from './auth';
export * from './validation';
export * from './error';
`.trim();

        fs.writeFileSync(path.join(outputDir, 'src', 'middleware', 'index.ts'), indexContent);
    }

    private async generateReadme(spec: OpenAPIDocument, outputDir: string): Promise<void> {
        const title = spec.info?.title || 'OpenAPI Express Server';
        const description = spec.info?.description || 'Express server generated from OpenAPI specification';
        const version = spec.info?.version || '1.0.0';

        const readmeContent = `
# ${title}

${description}

API Version: ${version}

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

\`\`\`bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
\`\`\`

### Development

\`\`\`bash
# Run in development mode with hot reloading
npm run dev
\`\`\`

## API Documentation

This server implements the following API endpoints:

${this.generateEndpointDocs(spec)}

### HATEOAS Support

All API responses include HATEOAS-style links in the form of an \`href\` property that points to the canonical URL for accessing each resource individually. This allows for easier navigation through the API.

## Project Structure

\`\`\`
src/
├── controllers/    # Request handlers for each route
├── middleware/     # Express middleware
├── models/         # Data models and interfaces
├── routes/         # API route definitions
└── index.ts        # Application entry point
\`\`\`

## License

This project is licensed under the ISC License.
`.trim();

        fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent);
    }

    private generateEndpointDocs(spec: OpenAPIDocument): string {
        let docs = '';

        if (spec.paths) {
            for (const [path, pathItem] of Object.entries(spec.paths || {})) {
                for (const [method, operation] of Object.entries(pathItem || {})) {
                    if (['get', 'post', 'put', 'delete', 'patch'].includes(method) && operation) {
                        const op = operation as OpenAPIV3.OperationObject;
                        docs += `\n### ${method.toUpperCase()} ${path}\n\n`;

                        if (op.summary) {
                            docs += `${op.summary}\n\n`;
                        }

                        if (op.description) {
                            docs += `${op.description}\n\n`;
                        }
                    }
                }
            }
        }

        return docs;
    }

    public run(): void {
        this.program.parse(process.argv);
    }
}

// Create and run the generator
const generator = new OpenAPIExpressGenerator();
generator.run(); 