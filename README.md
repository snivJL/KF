# Invoice Import App

This project provides a web interface for importing invoices into Zoho CRM. It is built with Next.js and Prisma and includes various utilities for syncing data with Zoho as well as managing territories and geocoding accounts.

## Purpose

The app simplifies the process of uploading invoice data from Excel files. Rows are validated against local copies of Accounts, Products and Employees and then grouped to create Zoho invoices. OAuth is used to access the Zoho CRM API and tokens are stored in cookies.

Major features include:

- OAuth 2.0 authentication with Zoho CRM
- Invoice validation and upload workflow
- Geocoding accounts with the Google Maps API
- Utilities for syncing products, employees, accounts and contacts
- Territory workflow triggers and basic history/log pages

## Environment Variables

Set the following variables in an `.env` file:

```
DATABASE_URL=postgres://user:pass@localhost:5432/db
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REDIRECT_URI=https://your-app.com/api/auth/callback
ACCOUNT_URL=https://accounts.zoho.com
BASE_URL=https://kf.zohoplatform.com
GOOGLE_API_KEY=your_google_key
```

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Generate the Prisma client and push the schema to your database:

   ```bash
   pnpm db:push
   pnpm prisma generate
   ```

3. Start the development server:

   ```bash
   pnpm dev
   ```

Visit `http://localhost:3000` to view the app.

## Authentication Flow

Navigating to [`/api/auth/login`](app/api/auth/login/route.ts) redirects the user to Zoho's authorization page. After granting access, Zoho redirects back to `/api/auth/callback`, which exchanges the code for an access token and refresh token. Tokens are stored in cookies and `/api/auth/refresh` can be used to obtain a new access token when it expires.
