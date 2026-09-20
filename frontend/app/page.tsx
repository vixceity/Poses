export default function Page() {
  return (
    <main className="poses-screen flex min-h-dvh items-center justify-center p-6">
      <section className="anim-enter w-full max-w-3xl border-[3px] border-[#0d2b49] bg-[#071d35] p-6 shadow-[10px_10px_0_rgba(3,12,24,0.5)] sm:p-10">
        <div className="mb-10 flex items-center justify-between gap-4">
          <h1 className="font-black text-4xl uppercase tracking-[0.14em] text-[#efd31e] sm:text-6xl">POSES</h1>
          <span className="font-hud text-[10px] tracking-[0.25em] text-[#9cbad8]">CAMERA GAME</span>
        </div>
        <p className="mb-8 max-w-xl font-hud text-sm uppercase tracking-[0.12em] text-[#dfefff]">
          Copy the pose before the timer runs out. First to spell POSES loses.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <a href="/local" className="border-2 border-black bg-[#efd31e] px-5 py-4 text-center font-black uppercase tracking-[0.12em] text-[#0f0f0f] shadow-[4px_5px_0_#0f0f0f] transition hover:-translate-y-1 hover:bg-[#f28c28]">
            Local game
          </a>
          <a href="/multiplayer" className="border-2 border-black bg-[#5fc8eb] px-5 py-4 text-center font-black uppercase tracking-[0.12em] text-[#0f0f0f] shadow-[4px_5px_0_#0f0f0f] transition hover:-translate-y-1 hover:bg-[#83e9ab]">
            Online game
          </a>
        </div>
      </section>
    </main>
  )
}
