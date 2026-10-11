# Mirai-ext

Arabic subtitles from [miraianime.net](https://miraianime.net) for [Hayase](https://hayase.watch).

Unofficial. It is not made by, or connected to, Mirai Anime or Hayase. Every file belongs to the people who translated it, the extension only fetches what the site already serves to anyone.

## Add it

Paste this link into Hayase's extension box:

```
https://raw.githubusercontent.com/scigward/Mirai-ext/main/index.json
```

No account is needed. The subtitle pages and the zip files are public, nothing is logged into and nothing is stored.

## What it does

When an episode starts, Hayase asks every subtitle extension for files. This one:

1. finds the anime on the site by its MyAnimeList id (and AniList id), falling back to the title,
2. reads the anime's subtitle page and picks the zips that have the episode,
3. opens only the part of each zip it needs (a range request, so a 60 MB batch costs about one subtitle file),
4. hands the subtitle to Hayase, named like `Arabic - Cr (WEB).ass`.

A few things it does on the way:

- a zip that mixes translators (one folder, a different group per episode) is read per file, and the track is named after the group of that file,
- batches that number a later season through the whole series (episode 23 next to `[S2-01]`) are matched by the number inside the season, with the series-wide number as a fallback,
- subtitles saved as `.txt`, or as `.srt` with ass inside, are read for what they are,
- old windows-1256 files are converted to utf-8,
- the answer comes back in about 8 seconds at the latest, with whatever is ready, since Hayase gives up on an extension after 10.

## Settings

| Setting | What it does |
| --- | --- |
| Translators | Names you like best, comma separated. Zips from the first one found come first. |
| Max files | The most files to give for one episode. Default 3. |

## Limits

- `.7z` and `.rar` archives are not read. A few big recent series ship only that way, and a solid archive cannot be opened one file at a time.
- Some zips on the site miss an episode or two. Nothing can be done from here.
- The site itself is slow now and then. The first episode of an anime after Hayase starts takes the longest, the next ones are answered from memory.

## Development

```
npm ci
npm run check     # types, lint, tests, build
npm run smoke -- <myanimelist id> <episode> [series-wide episode] [title ...]
```

`npm run smoke` talks to the real site and writes what it got to `local/smoke/`. The tests never do, they use a fake site.

`dist/mirai.js` is the file Hayase downloads. It is built from `src/` and committed, and CI fails if the two differ. A change to it needs a new `version` in both `package.json` and `index.json`, or Hayase will not update.

## License

[MIT](LICENSE)
