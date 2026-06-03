import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), '.next');
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('Removed .next');
} else {
  console.log('.next not found');
}
