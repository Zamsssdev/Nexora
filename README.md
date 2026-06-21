# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Vercel Deployment

This project is configured for Vercel with `vercel.json` and a serverless API endpoint at `api/notify.js`.

1. Add environment variables in Vercel Project Settings:
   - `BOT_TOKEN`
   - `DISCORD_NOTIFY_CHANNEL_ID`

2. Deploy the project:

```bash
npx vercel --prod --yes
```

3. After deployment, test the notify endpoint:

```bash
curl -X POST https://nexora-livid-theta.vercel.app/api/notify \
  -H "Content-Type: application/json" \
  -d '{
    "gameTitle": "Contoh Game",
    "appid": "123456",
    "action": "Added",
    "details": "Game telah ditambahkan ke library Nexora"
  }'
```

If you need a custom channel override, include `channelId` in the request body.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
