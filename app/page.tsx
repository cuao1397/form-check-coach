import FormCheckApp from "@/components/FormCheckApp";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 pb-12 pt-10 sm:px-8 sm:pt-16">
      <header className="flex flex-col gap-3 text-center">
        <span className="mx-auto w-fit rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
          AI 트레이너
        </span>
        <h1 className="text-3xl font-bold sm:text-4xl">스마트 폼 체크 코치</h1>
        <p className="text-muted">
          운동 영상을 올리면 자세의 틀린 점을 알려 주고,
          <br className="hidden sm:block" /> 바로 해볼 수 있는 교정 포인트를 정리해 드려요.
        </p>
      </header>

      <FormCheckApp />

      <footer className="mt-auto flex flex-col gap-1 border-t border-line pt-6 text-center text-xs text-muted">
        <p>이 서비스는 의료 서비스가 아니며, 통증이 있으면 전문의/PT 전문가 상담을 권장합니다.</p>
        <p>
          본 서비스는 Google Gemini API(무료 이용 구간)를 사용합니다. 올린 영상은 분석을 위해
          Google로 전송되며, 이 구간에서는 Google이 전송된 내용을 서비스 개선에 사용하고 사람이
          검토할 수 있습니다. 이 서비스는 영상을 분석하는 동안에만 임시로 처리하고 분석이 끝나면
          바로 삭제하며, 보관하지 않습니다.
        </p>
      </footer>
    </main>
  );
}
