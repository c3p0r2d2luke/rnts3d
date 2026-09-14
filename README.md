Hello. This is my website

# RNTS 3D

## Run locally

Copy `.env.example` to `.env`, fill in the values, and start the server:

```bash
cp .env.example .env
npm start
```

The server loads `.env` automatically. Existing environment variables take precedence over values in the file. Keep `.env` private and never commit it.

## Model slicing

The quote builder uploads the selected model to `/api/slice`. The backend runs the command in `SLICER_COMMAND`, reads the generated G-code time comment, and uses that duration in the estimate. The default profile is in `profiles/default.ini`; adjust it for the actual printer before accepting production quotes.