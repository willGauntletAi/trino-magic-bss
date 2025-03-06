# OpenAPI Parser

A utility to parse OpenAPI specifications (both JSON and YAML formats) and extract endpoint information.

## Features

- Recursively finds all OpenAPI specification files (`.json`, `.yaml`, `.yml`) in a directory
- Parses each file and extracts endpoint information
- Groups endpoints by their tags from the OpenAPI specification
- Outputs a JSON file with data about each endpoint including:
  - `operationId`
  - `path`
  - `method`
- Automatically generates operation IDs if they are not specified in the OpenAPI spec

## Installation

```bash
npm install
```

## Usage

First, build the TypeScript:

```bash
npm run build
```

Then run the parser:

```bash
npm run parse -- <input-directory> [output-file]
```

Where:
- `<input-directory>` is the directory containing OpenAPI specification files (required)
- `[output-file]` is the path where the output JSON file should be written (optional, defaults to `endpoints.json`)

### Example

```bash
npm run parse -- ./specs output/api-endpoints.json
```

This command will:
1. Find all OpenAPI spec files in the `./specs` directory and its subdirectories
2. Extract all endpoint information from those specs
3. Group endpoints by their tags
4. Write the results to `output/api-endpoints.json`

## Output Format

The output file is a JSON object where each key is a tag name and each value is an array of endpoints with that tag:

```json
{
  "account management": [
    {
      "operationId": "retrieveBillingAccount",
      "path": "/billingAccount/{id}",
      "method": "get"
    },
    {
      "operationId": "customerBillFind",
      "path": "/customerBill",
      "method": "get"
    }
  ],
  "service catalog": [
    {
      "operationId": "listService",
      "path": "/service",
      "method": "get"
    }
  ]
}
```

### Notes about Tags

- Endpoints in the OpenAPI specification can have multiple tags, in which case they will appear in multiple tag groups in the output.
- If an endpoint has no tags in the OpenAPI specification, it will be placed in a "default" group.

## Notes

- If an operation in the OpenAPI spec doesn't have an `operationId`, one will be automatically generated based on the HTTP method and path.
- The parser handles both OpenAPI 2.0 (Swagger) and OpenAPI 3.x specifications. 