/**
 * 렌더·고정 스텝·빌드 산출물에 대한 회귀 방지 하네스다.
 * 장비별 FPS를 CI에서 단정하지 않고, 확인 가능한 성능 계약과 번들 예산을 검사한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** build 후 assets 아래 JavaScript 파일을 재귀적으로 수집한다. */
function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

/** 소스 계약과 빌드 산출물을 함께 보고해 회귀 위치를 즉시 알린다. */
const findings = [];
const trainingScene = readFileSync("src/app/TrainingScene.tsx", "utf8");
const weekendScene = readFileSync("src/app/RaceWeekendScene.tsx", "utf8");
const appShell = readFileSync("src/app/App.tsx", "utf8");
const collisionWorld = readFileSync("src/gameplay/race/RapierMultiCarCollision.ts", "utf8");

if (!trainingScene.includes("fixedTimestep.advance") || trainingScene.includes("runner.advance(2)")) {
  findings.push("Training Lab은 프레임당 고정 2-step 대신 FixedTimestepAccumulator를 사용해야 합니다.");
}
if (!weekendScene.includes("FixedTimestepAccumulator") || weekendScene.includes("Math.ceil(Math.max(0, deltaSeconds) * 120)")) {
  findings.push("Race Weekend는 ceil 기반 catch-up 대신 제한된 FixedTimestepAccumulator를 사용해야 합니다.");
}
if (!appShell.includes("dpr={[1, 1.25]}") || !appShell.includes('shadows="basic"')) {
  findings.push("Canvas DPR 상한 1.25와 basic shadow 성능 계약이 유지되어야 합니다.");
}
if (!collisionWorld.includes("colliderIdsByHandle") || collisionWorld.includes("[...this.colliders.entries()].find")) {
  findings.push("Rapier 접촉 callback은 collider handle 직접 조회를 사용해야 합니다.");
}

const assetsDirectory = "dist/assets";
const assetFiles = collectJavaScriptFiles(assetsDirectory);
const totalJavaScriptBytes = assetFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const largestJavaScriptBytes = assetFiles.reduce((largest, file) => Math.max(largest, statSync(file).size), 0);
const MAX_TOTAL_JAVASCRIPT_BYTES = 4_000_000;
// 모드 분할 뒤 Rapier lazy chunk(약 2.24 MB)를 허용하되 이전 3.6 MB 단일 bundle로의 회귀는 막는다.
const MAX_SINGLE_JAVASCRIPT_BYTES = 2_500_000;

if (totalJavaScriptBytes > MAX_TOTAL_JAVASCRIPT_BYTES) {
  findings.push(`전체 JavaScript ${totalJavaScriptBytes} B가 ${MAX_TOTAL_JAVASCRIPT_BYTES} B 예산을 초과했습니다.`);
}
if (largestJavaScriptBytes > MAX_SINGLE_JAVASCRIPT_BYTES) {
  findings.push(`단일 JavaScript ${largestJavaScriptBytes} B가 ${MAX_SINGLE_JAVASCRIPT_BYTES} B 예산을 초과했습니다.`);
}

if (findings.length > 0) {
  console.error("[최적화 리뷰 실패]");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`[최적화 리뷰 통과] JS ${totalJavaScriptBytes} B / 최대 chunk ${largestJavaScriptBytes} B, fixed-step·Canvas·Rapier 계약을 확인했습니다.`);
