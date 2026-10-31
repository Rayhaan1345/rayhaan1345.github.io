# rayhaan1345.github.io

Source of [rayhaan1345.github.io](https://rayhaan1345.github.io), the personal site of Rayhaan Khan.

The site is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves the `main` branch.

- `index.html` holds the page.
- `assets/site.css` and `assets/site.js` hold the styles and the two interactive figures: the toy optimizer run and the In-Place TTT chart.
- `assets/img/` holds the portrait and the figures from the papers.
- `cv.pdf` is the current CV.
- `projects/<name>/` contains one project page per research project, with its own script and figures. `assets/project.css` styles them. So far: `projects/in-place-ttt/`, `projects/optimizer-state/` and `projects/diabetes-screening/`. The diabetes page runs the deployed model in the browser: `model.json` stores its weights, and `net.js` runs them.
- `assets/img/email.png` shows the contact address as an image, drawn in Bradley Hand Bold at 96 px on a transparent background, so scrapers do not read it. The email links hold the address in reversed pieces and assemble it only when clicked.
