# Filesystem API

The Filesystem API exposes tenant-scoped file operations through `/fs/*`.
It is intended for authenticated clients that need to read, write, or delete files
without going through a browser interface.

## Base Path

`/fs/*`

## Authentication

All Filesystem API routes require a valid Auth0 bearer token mapped to a Monk tenant/user.

```bash
Authorization: Bearer <auth0_access_token>
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fs/*` | Read a file or list a directory. Use `?stat=true` for metadata only. |
| PUT | `/fs/*` | Write a file. |
| DELETE | `/fs/*` | Delete a file or directory. |

## Notes

- Paths are tenant-scoped.
- `GET /fs/*` returns file content for files and directory listings for folders.
- `?stat=true` returns metadata without reading file contents.
- The filesystem API is useful for agent workflows that need structured file access.

## Related Documentation

- [Root README](/)
- [API overview](/docs)
