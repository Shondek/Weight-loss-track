import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // כל לוגיקת הזמן מניחה אזור זמן מקומי. הבדיקות מריצות את אזור הזמן האמיתי
    // של המשתמש כדי שמעברי שעון קיץ/חורף ייבדקו באמת.
    env: { TZ: 'Asia/Jerusalem' },
  },
});
