# Trino Magic BSS

This project provides a Docker Compose setup for running Trino.

## Getting Started

### Prerequisites

- Docker
- Docker Compose
- Google API Service Account credentials (for Sheets connector)

### Running Trino

To start the Trino container:

```bash
docker-compose up -d
```

This will start a Trino server that is accessible at http://localhost:8080.

### Connecting to Trino

You can connect to Trino using the CLI, which is available in the container:

```bash
docker exec -it trino trino
```

Or you can use the web UI at http://localhost:8080.

### Configuration

The Trino configuration is in the `etc` directory:

- `etc/config.properties`: Basic coordinator configuration
- `etc/jvm.config`: JVM settings
- `etc/node.properties`: Node-specific configuration
- `etc/catalog/memory.properties`: Memory connector configuration
- `etc/catalog/sheets.properties`: Google Sheets connector configuration

You can add more catalog configurations in the `etc/catalog` directory.

### Google Sheets Connector Setup

The Google Sheets connector requires:

1. A Google Cloud project with the Google Sheets API enabled
2. A service account with access to the sheets you want to query
3. A metadata spreadsheet that defines your schemas and tables

Before running the container:

1. **Create a Google Cloud Service Account**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Navigate to "APIs & Services" > "Enabled APIs" and enable the Google Sheets API
   - Go to "IAM & Admin" > "Service Accounts" and create a new service account
   - Grant it appropriate roles (at minimum "Viewer" for the sheets you'll access)
   - Create a key for the service account (JSON format)
   - Download the JSON key file

2. **Set up the credentials**:
   - Place the downloaded JSON key file in the `credentials` directory as `service-account.json`
   - Share your Google Sheets with the service account's email address (it looks like `something@project-id.iam.gserviceaccount.com`)

3. **Create a metadata spreadsheet**:
   - Create a new Google Sheet to define your schemas and tables
   - Format it according to the template provided in `sheets-metadata-template.csv`
   - Find the spreadsheet ID in the URL (it's the long string after `/d/` and before `/edit`)
   - Update the `SHEETS_METADATA_ID` environment variable in `docker-compose.yml`

For more information about the metadata spreadsheet format and how to configure tables, see the [Trino Google Sheets connector documentation](https://trino.io/docs/current/connector/googlesheets.html).

### Stopping Trino

To stop the Trino container:

```bash
docker-compose down
```

## License

This project is licensed under the ISC License - see the LICENSE file for details. 