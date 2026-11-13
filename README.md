# Sachin Gaikwad — Portfolio

Static portfolio site (plain HTML/CSS/JS, no build step), hosted on GitHub Pages.

- `index.html` — home: hero, work, about, skills, FAQs, contact
- `work/*.html` — one page per case study
- `assets/css/style.css` — all styles
- `assets/js/fluid.js` — interactive fluid hero background (WebGL2)
- `assets/js/main.js` — nav, scroll reveals, "Ask me" typewriter

## Run locally

```bash
python3 -m http.server 4321
```

Then open http://localhost:4321.

## Credits

The hero fluid simulation is a WebGL2 port of the "Interactive Fluid" example from
[vgpu](https://github.com/vercel-labs/vgpu) by Vercel, used under the MIT License:

> MIT License — Copyright (c) 2025 Vercel, Inc.
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Fonts: Instrument Serif, Inter and Fragment Mono via Google Fonts.
