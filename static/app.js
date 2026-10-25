(() => {
  const ACCEPTED = /\.(jpe?g|png|webp)$/i;
  const MAX_BYTES = 12 * 1024 * 1024;

  const $ = (id) => document.getElementById(id);
  const fileInput = $("file");
  const drop = $("drop");
  const autoToggle = $("auto");
  const runBtn = $("run");
  const downloadBtn = $("download");
  const statusEl = $("status");
  const originalImg = $("original");
  const canvas = $("result");
  const emptyNote = $("after-empty");
  const swatches = document.querySelectorAll(".swatch");
  const customColor = $("custom-color");

  let currentFile = null;
  let originalUrl = null;
  let cutout = null;              // decoded transparent PNG from the server
  let background = "transparent"; // "transparent" or a CSS color
  let busy = false;

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", isError);
  }

  function setBusy(on) {
    busy = on;
    drop.classList.toggle("busy", on);
    fileInput.disabled = on;
    runBtn.disabled = on || !currentFile;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the result image."));
      img.src = src;
    });
  }

  // Draws the cut-out over the chosen background. Done in the browser, so
  // changing the color never spends another remove.bg credit.
  function drawResult() {
    if (!cutout) return;
    canvas.width = cutout.naturalWidth;
    canvas.height = cutout.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(cutout, 0, 0);
    canvas.hidden = false;
    emptyNote.hidden = true;
  }

  function clearResult() {
    cutout = null;
    canvas.hidden = true;
    emptyNote.hidden = false;
    downloadBtn.disabled = true;
  }

  async function readError(res) {
    try {
      const data = await res.json();
      return data.error || `Request failed (${res.status}).`;
    } catch {
      return res.status === 413
        ? "That photo is too large. Try one under 15 MB."
        : `Request failed (${res.status}).`;
    }
  }

  async function removeBackground() {
    if (!currentFile || busy) return;
    setBusy(true);
    setStatus("Removing the background. This takes a few seconds…");
    try {
      const form = new FormData();
      form.append("image", currentFile);
      const res = await fetch("/api/remove", { method: "POST", body: form });
      if (!res.ok) throw new Error(await readError(res));

      const url = URL.createObjectURL(await res.blob());
      cutout = await loadImage(url);
      URL.revokeObjectURL(url);

      downloadBtn.disabled = false;
      drawResult();
      setStatus("Done. Pick a background color, or download the PNG.");
    } catch (err) {
      setStatus(err.message || "Something went wrong.", true);
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file) {
    if (!file || busy) return;
    if (!ACCEPTED.test(file.name)) {
      setStatus("Use a JPG, PNG or WEBP photo.", true);
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("That photo is over 12 MB. Pick a smaller one.", true);
      return;
    }

    currentFile = file;
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = URL.createObjectURL(file);
    originalImg.src = originalUrl;
    originalImg.hidden = false;

    clearResult();
    runBtn.disabled = false;

    if (autoToggle.checked) {
      await removeBackground();
    } else {
      setStatus("Photo ready. Press Remove background when you want.");
    }
  }

  function setBackground(value) {
    background = value;
    swatches.forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.bg === value)));
    drawResult();
  }

  // Events

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    chooseFile(file);
  });

  ["dragenter", "dragover"].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    }));

  ["dragleave", "drop"].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    }));

  drop.addEventListener("drop", (e) => chooseFile(e.dataTransfer.files[0]));

  runBtn.addEventListener("click", removeBackground);

  swatches.forEach((btn) =>
    btn.addEventListener("click", () => setBackground(btn.dataset.bg)));
  customColor.addEventListener("input", () => setBackground(customColor.value));

  autoToggle.addEventListener("change", async () => {
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_remove: autoToggle.checked }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus(autoToggle.checked
        ? "Auto remove is on. Photos clean up as soon as you pick them."
        : "Auto remove is off. Press Remove background when you are ready.");
    } catch {
      setStatus("Could not save that choice. Try again.", true);
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!cutout) return;
    canvas.toBlob((blob) => {
      const base = currentFile ? currentFile.name.replace(/\.[^.]+$/, "") : "photo";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${base}-no-bg.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, "image/png");
  });
})();
