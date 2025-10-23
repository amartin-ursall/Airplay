# AetherLink

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amartin-ursall/Airplay)

A visually stunning web application for real-time messaging and large file transfers on the Cloudflare edge.

AetherLink is a sophisticated, real-time messaging and large file transfer application designed to run entirely on Cloudflare's edge network. It provides a seamless and visually stunning experience for users to connect, chat, and share files up to 1GB in size. The application features a live-updating list of online users, a clean and intuitive direct messaging interface, and a robust file transfer system. The entire experience is wrapped in a meticulously crafted design system, prioritizing visual excellence, fluid micro-interactions, and a delightful user journey.

## Key Features

-   **Real-Time Messaging:** Instant text-based communication between online users.
-   **Large File Transfers:** Share files up to 1GB seamlessly within the chat interface.
-   **Live Presence:** See a list of all currently online users, updated in real-time.
-   **Modern & Responsive UI:** A beautiful two-panel layout that adapts perfectly to all screen sizes, from desktop to mobile.
-   **Edge-Powered:** Built to run entirely on Cloudflare's global network for low latency and high performance.
-   **Persistent Conversations:** Chat history is saved and loaded when you reconnect with a user.

## Technology Stack

-   **Frontend:**
    -   [React](https://react.dev/)
    -   [Vite](https://vitejs.dev/)
    -   [TypeScript](https://www.typescriptlang.org/)
    -   [Tailwind CSS](https://tailwindcss.com/)
    -   [shadcn/ui](https://ui.shadcn.com/)
    -   [Zustand](https://zustand-demo.pmnd.rs/) for state management
    -   [Framer Motion](https://www.framer.com/motion/) for animations
-   **Backend:**
    -   [Hono](https://hono.dev/) running on Cloudflare Workers
-   **Storage:**
    -   [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) for stateful coordination and message storage.

## Getting Started

Follow these instructions to get a local copy of the project up and running for development and testing purposes.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or later)
-   [Bun](https://bun.sh/) package manager
-   [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/your-username/aetherlink_file_transfer.git
    cd aetherlink_file_transfer
    ```

2.  **Install dependencies:**
    This project uses Bun for package management.
    ```sh
    bun install
    ```

## Development

To start the local development server, which includes both the Vite frontend and the local Wrangler server for the backend, run:

```sh
bun dev
```

This will open the application in your default browser, typically at `http://localhost:3000`. The frontend will automatically reload on changes, and the worker backend will be available for API requests.

## Deployment

This application is designed for easy deployment to Cloudflare's network.

1.  **Log in to Wrangler:**
    If you haven't already, authenticate the Wrangler CLI with your Cloudflare account.
    ```sh
    wrangler login
    ```

2.  **Deploy the application:**
    Run the deploy script, which will build the project and deploy it to your Cloudflare account.
    ```sh
    bun run deploy
    ```

Alternatively, you can deploy your own version of this project with a single click.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amartin-ursall/Airplay)

## Project Structure

-   `src/`: Contains the frontend React application code, including pages, components, hooks, and styles.
-   `worker/`: Contains the backend Hono application code that runs on Cloudflare Workers, including routes and Durable Object entity definitions.
-   `shared/`: Contains TypeScript types and interfaces shared between the frontend and backend to ensure type safety.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.