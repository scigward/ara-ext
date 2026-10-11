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

A few things it does on the way, all of them seen in real zips on the site:

- a zip that mixes translators (one folder, a different group per episode, like the Gintama one) is read per file, and the track is named after the group of that file,
- batches that number a later season through the whole series (episode 23 next to `[S2-01]`, or 39 to 50 for the twelve episodes of a part 2) are matched by the number the page uses, and by position when the zip numbers its files its own way,
- one file for two episodes (`001-002`), a `[V2]` re-release, a txt that is really a subtitle, an srt with ass inside, and windows-1256 files (converted to utf-8) are all read for what they are,
- zips of zips (one inner zip per episode) are opened one level down,
- a zip for one episode with one file in it is taken as it is, whatever number its name carries,
- the answer comes back in about 8 seconds at the latest, with whatever is ready, since Hayase gives up on an extension after 10.

## Settings

| Setting | What it does |
| --- | --- |
| Translators | Names you like best, comma separated. Zips from the first one found come first. |
| Max files | The most files to give for one episode. Default 3. |

## Limits

- `.7z` and `.rar` archives are not read. A few big recent series ship only that way, and a solid archive cannot be opened one file at a time.
- A subtitle file over 12 MB (or 4 MB zipped) is left out. Those are heavily typeset Blu-ray files that a phone could not show anyway.
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
