import type { Scene } from "../src/scene.ts";

// The shortest possible scene: proves login, recording, captions and compose work.
const scene: Scene = {
  id: "00-smoke",
  segments: [
    {
      surface: "desktop",
      title: "בדיקת מערכת",
      steps: [
        {
          name: "dashboard",
          caption: "זה לוח הבקרה",
          run: async ({ page, stage, env }) => {
            await page.goto(`${env.baseUrl}/dashboard`);
            await stage.highlight(page.getByRole("button", { name: "+ תיק חדש" }).first());
          },
        },
      ],
    },
  ],
};
export default scene;
