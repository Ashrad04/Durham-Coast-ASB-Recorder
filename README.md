# Durham Coast ASB Recorder

A mobile-first shared incident logging system for organisations and stakeholders working across the Durham Coast.

## Purpose

The app is designed to provide one consistent spatial log for anti-social behaviour, environmental damage and related incidents. It separates the original incident from subsequent partner actions so several organisations can contribute to one case history rather than creating disconnected records.

## Core features

- Mobile-first incident logging
- Recorder name and organisation retained on the device
- Permanent incident references in the format `DCA-YYYY-00001`
- GPS capture, GPS accuracy and manual map placement
- Durham Coast site suggestions while still allowing free-text sites
- Standard incident categories and subcategories
- Severity and workflow status
- Environmental, infrastructure, public-safety and designated-site impact flags
- Optional photographs, compressed in the browser
- Vehicle and identifiable-person information stored separately from general incident fields
- Police, CRM and partner references
- Lead organisation and assignment fields
- Linked/repeat incident references
- Follow-up date and status
- Multi-organisation action timeline on each incident
- Possible duplicate / related incident warning based on category, time and proximity
- Shared map and searchable incident list
- CSV and GeoJSON export for QGIS and reporting

## Production deployment

Use Railway with PostgreSQL for a real multi-user deployment.

Required/recommended environment variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
ACCESS_CODE=choose-a-strong-shared-pilot-code
SENSITIVE_ACCESS_CODE=use-a-different-restricted-code
```

Railway supplies `PORT` automatically. The application creates the required database tables and indexes on first start.

If `DATABASE_URL` is absent, the application falls back to `data/incidents.json`. This is useful for development and testing only. Railway container storage is not suitable for the live shared incident record because it can be replaced during redeployment.

## Information governance

This repository provides the technical structure for a partner pilot; it does not itself establish a lawful information-sharing arrangement. Before operational use across organisations, participating bodies should agree data-controller responsibilities, lawful basis and purpose, access permissions, retention, handling of identifiable information, subject-rights processes and breach procedures.

The general incident view deliberately excludes restricted vehicle registration and identifiable-person fields. For a mature production system, replace the pilot shared-code model with named authenticated user accounts and role-based permissions.

## Emergency use

This application is not an emergency-reporting channel. Immediate threats to life or emergencies should be reported through the appropriate emergency service route.

## GIS

Coordinates are stored as WGS84 latitude/longitude (`EPSG:4326`). GeoJSON exports use `[longitude, latitude]` coordinate order and can be loaded directly into QGIS. CSV export includes latitude and longitude fields for delimited-text import.
