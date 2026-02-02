document.querySelectorAll('button[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.setAttribute('data-copied', '');
    setTimeout(() => button.removeAttribute('data-copied'), 2000);
  });
});

(() => {
  const canvas = document.getElementById('matrix');
  const ctx = canvas.getContext('2d');

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789#@$%&*+=<>{}[]()';
  const fontSize = 14;
  let cols, rows;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.ceil(canvas.width / fontSize);
    rows = Math.ceil(canvas.height / fontSize);
  };

  resize();
  window.addEventListener('resize', resize);

  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0a1a08';
    ctx.font = `${fontSize}px berkeley, monospace`;

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, j * fontSize + fontSize);
      }
    }
  };

  setInterval(draw, 100);
})();
