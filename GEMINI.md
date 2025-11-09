# Project Overview

This is a personal budget tracking application built with Nuxt.js for the frontend and Convex for the backend. The application allows users to track their daily spending, manage extra income, and follow a debt snowball plan. It uses Nu.xt UI for UI components.

## Technologies

- **Frontend:** [Nuxt.js](https://nuxt.com/) (a [Vue.js](https://vuejs.org/) framework)
- **UI:** [Nuxt UI](https://ui.nuxt.com/)
- **Backend:** [Convex](https://www.convex.dev/) (a reactive database)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Package Manager:** [Bun](https://bun.sh/)

## Project Structure

- `app/app.vue`: The main entry point for the Nuxt application.
- `convex/`: Contains the Convex backend code, including the database schema and queries/mutations.
- `convex/schema.ts`: Defines the database schema for `spending`, `extraDollars`, and `snowball`.
- `convex/*.ts`: Contain the backend logic for querying and mutating data.
- `nuxt.config.ts`: Configuration file for the Nuxt.js application.
- `package.json`: Lists the project dependencies and scripts.

# Building and Running

1. **Install dependencies:**

   ```bash
   bun install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file in the root of the project and add the following line:

   ```
   CONVEX_URL=your-convex-url
   ```

   Replace `your-convex-url` with your actual Convex deployment URL.

3. **Run the development server:**

   ```bash
   bun run dev
   ```

   The application will be available at `http://localhost:3000`.

4. **Build for production:**

   ```bash
   bun run build
   ```

# Development Conventions

- The backend logic is organized into files within the `convex/` directory, corresponding to the data they manage (e.g., `spending.ts`, `snowball.ts`).
- The database schema is defined in `convex/schema.ts`.
- The frontend makes reactive queries to the Convex backend using `useConvexQuery`.

# TODO

- [x] Setup Auth
- [x] Setup Nuxt Hub
- [x] Deploy to Cloudflare
- [x] List Spending
- [x] ADD Spending
- [x] List Extra Dollars
- [x] ADD Extra Dollars
- [x] list Snowball
- [x] Add Snowball
- [ ] Home Screen
  - [ ] UI
    - [x] Selected Month
    - [x] Monthly Total
    - [x] Remaining for Month
  - [ ] Actions
    - [ ] Change Selected Month
    - [ ] Add Spending
- [ ] Money Cards Component
- [ ] Transaction Tile Component
- [ ] Integrate Components into Home Screen
- [ ] Forms Integration
- [ ] Add item to snowball list
- [ ] Update daily spending total
