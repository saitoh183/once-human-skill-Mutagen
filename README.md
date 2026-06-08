# Once Human Skill Mutagen

Static frontend with Cloudflare Pages Functions + D1 for an editable deviation/skill database.

## Cloudflare setup

```bash
# Requires CLOUDFLARE_API_TOKEN in the environment.
npm install
npx wrangler d1 create oncehuman-skill-mutagen
```

Copy the returned `database_id` into `wrangler.toml`.

Seed the database:

```bash
npm run seed:remote
```

Optional: seed a first edit key at the same time:

```bash
SKILL_MUTAGEN_EDIT_KEY='<20-character-key>' npm run seed:remote
```

Deploy to Cloudflare Pages:

```bash
npm run pages:deploy
```

Set the Pages secret used by `/keys/` to generate/revoke editor keys:

```bash
npx wrangler pages secret put EDIT_KEYS_ADMIN_KEY --project-name once-human-skill-mutagen
```

## Editing

- Main app: `/Deviation-Skills.html`
- Edit key admin: `/keys/`
- API:
  - `GET /api/database`
  - `PUT /api/database` with `X-Edit-Key`
  - `POST /api/edit-keys` for validate/generate
