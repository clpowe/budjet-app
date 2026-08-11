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
- [x] Home Screen
  - [x] UI
    - [x] Selected Month
    - [x] Monthly Total
    - [x] Remaining for Month
  - [x] Actions
    - [x] Change Selected Month
    - [x] Add Spending
- [ ] Money Cards Component
- [ ] Transaction Tile Component
- [ ] Integrate Components into Home Screen
- [ ] Forms Integration
- [ ] Add item to snowball list
- [x] Update daily spending total

# Instructions

- When I ask what do I need todo or whats next or any similer phrase refer to GEMINI.MD.
- Do not sart on any task without me telling you to start If I ask whats next whats todo just show the list from GEMINI.md DO NOT START ANY WORK!!!

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
