# Consera --- Construction Material Management System

Consera is a construction material management platform designed to
connect sites with surplus construction materials to projects that need
them. It supports material inventory tracking, project requirements,
reservations, inspections, transfers, and activity visibility.

## Project Overview

Construction projects often have unused materials while other sites face
shortages. Consera provides a centralized way to record available
materials, track their condition and quantities, request reservations,
and monitor transfers between sites and projects.

## Key Features

-   **Dashboard:** Overview of material inventory and operational
    activity.
-   **Project Management:** Maintain construction project information
    and project requirements.
-   **Inventory Management:** Track materials, quantities, units,
    condition, and availability.
-   **Reservations:** Request, review, approve, reject, and fulfil
    material reservations.
-   **Material Inspections:** Record inspection results and material
    condition.
-   **Transfers:** Track material transfers through their lifecycle,
    including pending, in-transit, delivered, and cancelled states where
    supported.
-   **Notifications and Activity Logs:** Maintain visibility into
    relevant system events.

## Technology Stack

-   **Frontend and application framework:** Next.js (App Router) with
    React and TypeScript
-   **Styling:** Tailwind CSS
-   **Operational database:** MongoDB
-   **Database shell:** `mongosh`
-   **Relational database coursework artefact:** MySQL schema, views,
    stored procedures, and trigger examples

> **Database note:** The running application uses MongoDB
> (`consera_nosql`). The MySQL implementation is a separate relational
> database artefact used for the DBMS design and SQL demonstrations; it
> is not the application's MongoDB connection.

## Repository Structure

The repository contains the application and its supporting project
files. The main Next.js application is in `frontend/`.

Typical areas inside the frontend include:

-   `app/` --- Next.js routes, pages, and layouts
-   `components/` --- reusable interface components, where present
-   `lib/` --- shared utilities and database connection code
-   `public/` --- static assets

The exact directory contents may evolve as the project is developed.

## Getting Started

### Prerequisites

-   Node.js and npm
-   MongoDB running locally or a reachable MongoDB deployment
-   Git

### 1. Clone the repository

``` bash
git clone <GITHUB_REPOSITORY_URL>
cd <REPOSITORY_FOLDER>
```

### 2. Install dependencies

``` bash
cd frontend
npm install
```

### 3. Configure environment variables

Create a local environment file in `frontend/` using the variable names
expected by `frontend/lib/mongodb.ts`.

For example, the application may use a MongoDB connection URI and
database name:

``` env
MONGODB_URI=<YOUR_MONGODB_CONNECTION_URI>
MONGODB_DB=consera_nosql
```

Check `frontend/lib/mongodb.ts` and the project's existing environment
configuration to confirm the exact variable names before running the
application.

**Do not commit `.env`, `.env.local`, database credentials, API keys, or
other secrets.**

### 4. Start the development server

From the `frontend/` directory:

``` bash
npm run dev -- --webpack
```

Open <http://localhost:3000> in your browser.

### 5. Run validation

TypeScript check:

``` bash
npm exec tsc -- --noEmit
```

Production build:

``` bash
npm run build
```

## MongoDB Database

The application's operational database is named `consera_nosql`.

Collections used by the application include:

-   `activity_logs`
-   `inventory`
-   `material_inspections`
-   `notifications`
-   `projects`
-   `reservations`
-   `transfer_events`
-   `transfers`
-   `counters`
-   `transfer_inventory_allocations`

Collection schemas and application-level workflows are implemented
through the MongoDB database layer and Next.js application code. Use the
project's actual initialization or seed scripts, if provided, rather
than inserting sample data into an existing database blindly.

## MySQL DBMS Demonstration

The project also includes a MySQL relational implementation for
demonstrating database concepts. The demonstrated SQL features include:

-   Relational tables, keys, and constraints
-   Views:
    -   `vw_inventory_summary`
    -   `vw_reservation_overview`
    -   `vw_transfer_tracking`
-   Stored procedures:
    -   `sp_approve_reservation`
    -   `sp_dispatch_transfer`
    -   `sp_complete_transfer`
    -   `sp_reject_reservation`
-   Trigger:
    -   `trg_reservation_status_audit`

The MySQL database is a separate coursework artefact from the MongoDB
database used by the running application.

## Important Development Notes

-   Preserve existing database records when testing workflows.
-   Use a separate test database or clearly identified test records for
    demonstrations.
-   Never commit secrets or local environment files.
-   Review the Git diff before committing or pushing changes.

## Contributors

-   **Akshat Shaurya** --- `PES2UG24CS047`
-   **Sai Dhyan** --- `PES2UG24CS055`

## Academic Project

Consera is developed as a DBMS mini-project at PES University.

------------------------------------------------------------------------

*Update this README whenever the setup process, environment variables,
repository structure, or implemented features change.*


