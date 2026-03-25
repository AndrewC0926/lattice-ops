import { createApp } from './app.js';

const PORT = process.env.PORT ?? 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`lattice-ops API running on port ${PORT}`);
});
