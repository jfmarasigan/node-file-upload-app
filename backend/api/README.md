# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/cc5ff97e-1436-4edc-8884-668e087c90e7

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/cc5ff97e-1436-4edc-8884-668e087c90e7) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with .

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Oracle Database Requirements

To connect to Oracle databases, you need to have the Oracle Client libraries installed on your system. Here's how to install them:

### Windows
1. Download the Oracle Instant Client from [Oracle's website](https://www.oracle.com/database/technologies/instant-client/downloads.html)
2. Extract the downloaded zip file to a directory (e.g., `C:\oracle\instantclient`)
3. Add the directory to your system's PATH environment variable
4. Restart your terminal/IDE

### Linux
```bash
# For Ubuntu/Debian
sudo apt-get install libaio1
sudo mkdir -p /opt/oracle
cd /opt/oracle
# Download and extract Oracle Instant Client from Oracle's website
sudo sh -c "echo /opt/oracle/instantclient > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig
```

### macOS
```bash
# Using Homebrew
brew install instantclient-basic
```

After installing the Oracle Client libraries, restart your development server for the changes to take effect.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/cc5ff97e-1436-4edc-8884-668e087c90e7) and click on Share -> Publish.

## I want to use a custom domain - is that possible?

We don't support custom domains (yet). If you want to deploy your project under your own domain then we recommend using Netlify. Visit our docs for more details: [Custom domains](https://docs.lovable.dev/tips-tricks/custom-domain/)
