/**
 * Playwright가 같은 Chromium 프로세스에서 여러 R3F 장면을 순차 실행할 때
 * 이전 테스트의 WebGL 컨텍스트가 다음 테스트의 requestAnimationFrame을 막지 않게 정리한다.
 */
import type { Page } from "@playwright/test";

/** 각 E2E가 끝난 뒤 현재 페이지의 WebGL 컨텍스트를 명시적으로 해제한다. */
export async function releaseWebGLContexts(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("canvas").forEach((canvas) => {
      // R3F Canvas는 WebGL2를 우선 요청한다. WebGL1 fallback도 같은 방식으로 잃어야
      // 다음 테스트의 장면이 브라우저별 컨텍스트 한도에 걸리지 않는다.
      const context = (canvas.getContext("webgl2") as WebGL2RenderingContext | null)
        ?? (canvas.getContext("webgl") as WebGLRenderingContext | null);
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    });
  });
}
