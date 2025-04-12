# ScheduleGenie

ScheduleGenie is an AI-powered scheduling assistant built with [Next.js](https://nextjs.org). It leverages the Google Gemini API for AI-driven task scheduling and Auth0 for user authentication. The app allows users to input tasks, specify availability, and generate optimized schedules. Users can also interact with an AI assistant for task-specific help and manage their schedules through a Trello-style interface.

## Features

- **Voice-to-Text Input**: Use the Web Speech API to dictate tasks instead of typing.
- **AI-Powered Scheduling**: Automatically organize tasks into time blocks based on availability and preferences.
- **Interactive Task Management**: View and manage tasks in a Trello-style board.
- **AI Assistant Chat**: Get recommendations and assistance for tasks.
- **User Authentication**: Secure login and session management using Auth0.

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js) or [yarn](https://yarnpkg.com/)
- A MongoDB database (local or cloud, e.g., [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))
- A Google Gemini API key
- An Auth0 tenant for authentication

---

### Cloning the Repository

To clone the repository, run:

```bash
git clone https://github.com/your-username/schedulegenie.git
cd schedulegenie
```

---

### Setting Up Environment Variables

Create a `.env.local` file in the root of the project and add the following environment variables:

```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database-name>
MONGODB_DB_NAME=StudioGenieDB

# Google Gemini API Key
GOOGLE_GEMINI_API_KEY=your-google-gemini-api-key

# Auth0 Configuration
AUTH0_SECRET=your-auth0-secret
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-auth0-domain.us.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
```

Replace the placeholders (`<username>`, `<password>`, etc.) with your actual credentials.

---

### Installing Dependencies

Install the required dependencies using npm or yarn:

```bash
npm install
# or
yarn install
```

---

### Running the Development Server

Start the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

---

## How It Works

1. **Task Input**: Users can input tasks manually or use voice dictation via the Web Speech API.
2. **Schedule Generation**: The app sends tasks, availability, and preferences to the Google Gemini API, which returns an optimized schedule.
3. **Task Management**: Users can view, edit, and delete tasks in a Trello-style interface.
4. **AI Assistant**: Users can chat with an AI assistant for task-specific help.
5. **Authentication**: Auth0 handles user authentication and session management.

---

## Deployment

To deploy the app, you can use [Vercel](https://vercel.com/) or any other hosting platform that supports Next.js. Ensure the environment variables are set in the hosting platform's configuration.

---

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## License

This project is licensed under the MIT License.

---

## Acknowledgments

- [Next.js](https://nextjs.org)
- [Auth0](https://auth0.com)
- [Google Gemini API](https://cloud.google.com/generative-ai)
- [MongoDB](https://www.mongodb.com)
