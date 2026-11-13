"""第4回 演習問題の図（学生ページ exercises/04.html で使う）。

  pe04_q1_circuit.png : 問題1。方形波電圧源 v_in → コイル L → 直流電圧 V1 の回路と、v_in(t) の波形
  pe04_q2_circuit.png : 問題2。方形波電流源 i_in・コンデンサ C・直流電流源 I1 の並列回路と、i_in(t) の波形
  pe04_q3_rlc.png     : 問題3。RLC 直列回路（正弦波電圧源）
  pe04_q4_connect.png : 問題4。(a)〜(d) の4つの接続

回路の描き方・記号は第4回スライド（p14・p29・p37・p19・p32・p43・p45）に合わせてある。
方形波の電源はスライドと同じく電圧源・電流源とも同じ記号で描き、横の記号（v_in / i_in）で区別する。
再生成： python3 gen_pe04_figs.py
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import schemdraw
import schemdraw.elements as elm

plt.rcParams.update({
    "font.family": ["Hiragino Sans", "sans-serif"],
    "mathtext.fontset": "cm",
    "font.size": 14,
})
schemdraw.config(fontsize=17, lw=1.8)

RED = "#e0301e"
BLUE = "#1f5fd6"
ORANGE = "#f08c00"
FS = 22


def arrow(ax, x0, y0, x1, y1, color="k", lw=2.0):
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0),
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, mutation_scale=16))


def finish(ax, d, xlim, ylim):
    d.draw(show=False, canvas=ax)
    ax.set_aspect("equal")
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.axis("off")


def square_axes(ax, ylabel, amp_label, D=0.4, n=3, color="k"):
    """0〜nT の方形波（振幅 1、デューティ比 D）。横軸に DT, T, T+DT, ... の目盛。"""
    xs, ys = [0], [0]
    for k in range(n):
        xs += [k, k, k + D, k + D]
        ys += [0, 1, 1, 0]
    xs += [n]
    ys += [0]
    ax.plot(xs, ys, color=color, lw=2.4, solid_joinstyle="miter")
    ax.plot([0, n], [1, 1], ls=":", color="0.4", lw=1, zorder=0)
    for x in [D, 1, 1 + D, 2, 2 + D]:
        ax.plot([x, x], [1.02, 1.25], ls=":", color="0.6", lw=0.8)
    arrow(ax, -0.05, 0, n + 0.3, 0, lw=1.2)
    arrow(ax, 0, -0.08, 0, 1.5, lw=1.2)
    ax.text(n + 0.3, -0.1, "$t$", ha="center", va="top", fontsize=FS)
    ax.text(0.08, 1.5, ylabel, ha="left", va="center", fontsize=FS)
    ax.text(-0.08, 1, amp_label, ha="right", va="center", fontsize=FS)
    ax.text(-0.05, -0.05, "$0$", ha="right", va="top", fontsize=16)
    for x, lab in [(D, "$DT$"), (1, "$T$"), (1 + D, "$T+DT$"), (2, "$2T$"), (2 + D, "$2T+DT$")]:
        ax.text(x, -0.07, lab, ha="center", va="top", fontsize=14.5)
    ax.text(n + 0.02, 0.45, "$\\cdots$", fontsize=16)
    ax.set_xlim(-0.6, n + 0.45)
    ax.set_ylim(-0.35, 1.65)
    ax.axis("off")


# ================= 問題1：電圧源・コイル・直流電圧 =================
fig, (axc, axw) = plt.subplots(1, 2, figsize=(11.5, 3.8), gridspec_kw={"width_ratios": [1.0, 1.3]})
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSquare().up())                         # x=0, y=0→3
    d.add(elm.Line().right().length(0.8))
    d.add(elm.Inductor2(loops=3).right())                  # x=0.8→3.8
    d.add(elm.Line().right().length(0.8))
    d.add(elm.Battery().down())                            # x=4.6, y=3→0
    d.add(elm.Line().left().length(4.6))
finish(axc, d, (-2.5, 6.4), (-0.6, 4.7))
axc.text(-1.15, 1.5, "$v_{in}(t)$", ha="right", va="center", fontsize=FS)
arrow(axc, -0.9, 0.7, -0.9, 2.3)
axc.text(2.3, 2.45, "$L$", ha="center", va="top", fontsize=FS)
arrow(axc, 0.15, 3.35, 0.95, 3.35, BLUE)
axc.text(0.55, 3.5, "$i_L(t)$", ha="center", va="bottom", fontsize=FS)
arrow(axc, 3.3, 3.75, 1.3, 3.75, RED)
axc.text(2.3, 3.85, "$v_L(t)$", ha="center", va="bottom", fontsize=FS)
arrow(axc, 5.35, 0.7, 5.35, 2.3, ORANGE)
axc.text(5.55, 1.5, "$V_1$", ha="left", va="center", fontsize=FS, color="k")
square_axes(axw, "$v_{in}(t)$", "$V_0$")
fig.tight_layout()
fig.savefig("pe04_q1_circuit.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)


# ================= 問題2：電流源・コンデンサ・直流電流源 =================
fig, (axc, axw) = plt.subplots(1, 2, figsize=(11.5, 3.8), gridspec_kw={"width_ratios": [1.0, 1.3]})
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSquare().up())                         # x=0
    d.add(elm.Line().right().length(2.6))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Capacitor().down())                          # x=2.6
    d.add(elm.Dot())
    d.pop()
    d.add(elm.Line().right().length(5.0))
    d.add(elm.SourceI().down())                            # x=7.6, 矢印は下向き
    d.add(elm.Line().left().length(7.6))
finish(axc, d, (-2.7, 9.4), (-0.6, 4.2))
axc.text(-1.15, 1.5, "$i_{in}(t)$", ha="right", va="center", fontsize=FS)
arrow(axc, -0.9, 0.7, -0.9, 2.3)
axc.text(2.05, 1.5, "$C$", ha="right", va="center", fontsize=FS)
arrow(axc, 3.0, 2.2, 3.0, 0.8, BLUE)
axc.text(3.15, 1.0, "$i_C(t)$", ha="left", va="center", fontsize=FS)
arrow(axc, 5.0, 0.8, 5.0, 2.2, RED)
axc.text(5.15, 2.0, "$v_C(t)$", ha="left", va="center", fontsize=FS)
arrow(axc, 8.4, 2.3, 8.4, 0.7, ORANGE)
axc.text(8.6, 1.5, "$I_1$", ha="left", va="center", fontsize=FS)
square_axes(axw, "$i_{in}(t)$", "$I_0$")
fig.tight_layout()
fig.savefig("pe04_q2_circuit.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)


# ================= 問題3：RLC 直列回路 =================
fig, ax = plt.subplots(figsize=(6.2, 3.3))
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSin().up())                            # x=0
    d.add(elm.Line().right().length(0.6))
    d.add(elm.Inductor2(loops=3).right().length(2.4))      # 0.6→3.0
    d.add(elm.Line().right().length(0.4))
    d.add(elm.Capacitor().right().length(1.8))             # 3.4→5.2
    d.add(elm.Line().right().length(0.4))
    d.add(elm.Resistor().right().length(2.4))              # 5.6→8.0
    d.add(elm.Line().right().length(0.6))
    d.add(elm.Line().down().length(3))
    d.add(elm.Line().left().length(8.6))
finish(ax, d, (-2.4, 9.3), (-0.5, 4.4))
ax.text(1.8, 2.45, "$L$", ha="center", va="top", fontsize=FS)
ax.text(4.3, 2.45, "$C$", ha="center", va="top", fontsize=FS)
ax.text(6.8, 2.45, "$R$", ha="center", va="top", fontsize=FS)
ax.text(-1.15, 1.5, "$v(t)$", ha="right", va="center", fontsize=FS)   # 矢印を電源から離す（10/16）
arrow(ax, -0.9, 0.7, -0.9, 2.3)
arrow(ax, -0.45, 3.35, 0.25, 3.35, BLUE)
ax.text(-0.55, 3.35, "$i(t)$", ha="right", va="center", fontsize=FS)
ax.plot([0.62, 8.3, 8.3, 0.62, 0.62], [1.72, 1.72, 3.8, 3.8, 1.72], ls=":", color="0.4", lw=1.2)   # 名前（L・C・R）も枠の中に
ax.text(8.3, 3.9, "$Z$", ha="right", va="bottom", fontsize=FS)
fig.tight_layout()
fig.savefig("pe04_q3_rlc.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)


# ================= 問題4：4つの接続 =================
fig, axs = plt.subplots(2, 2, figsize=(10.0, 7.6))  # 2026-10-16 2×2 に
axs = axs.ravel()


def src_label(ax, name):
    ax.text(-1.15, 1.5, name, ha="right", va="center", fontsize=FS)   # 矢印を電源から離す
    arrow(ax, -0.9, 0.7, -0.9, 2.3)


# (a) 方形波電圧源 ∥ C
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSquare().up())
    d.add(elm.Line().right().length(2.4))
    d.add(elm.Capacitor().down())
    d.add(elm.Line().left().length(2.4))
finish(axs[0], d, (-2.7, 3.6), (-1.2, 3.6))
src_label(axs[0], "$v_{in}(t)$")
axs[0].text(2.95, 1.5, "$C$", ha="left", va="center", fontsize=FS)

# (b) 方形波電流源 → L
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSquare().up())
    d.add(elm.Line().right().length(2.4))
    d.add(elm.Inductor2(loops=3).down())
    d.add(elm.Line().left().length(2.4))
finish(axs[1], d, (-2.7, 3.6), (-1.2, 3.6))
src_label(axs[1], "$i_{in}(t)$")
axs[1].text(2.95, 1.5, "$L$", ha="left", va="center", fontsize=FS)

# (c) 方形波電流源 → L → R（2026-10-16）
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSquare().up())
    d.add(elm.Line().right().length(0.4))
    d.add(elm.Inductor2(loops=3).right().length(2.2))
    d.add(elm.Line().right().length(0.4))
    d.add(elm.Resistor().down())
    d.add(elm.Line().left().length(3.0))
finish(axs[2], d, (-2.7, 4.2), (-1.2, 3.6))
src_label(axs[2], "$i_{in}(t)$")
axs[2].text(1.5, 2.45, "$L$", ha="center", va="top", fontsize=FS)
axs[2].text(3.55, 1.5, "$R$", ha="left", va="center", fontsize=FS)

# (d) 方形波電流源 ∥ C ∥ R
with schemdraw.Drawing(show=False) as d:
    d.add(elm.SourceSquare().up())
    d.add(elm.Line().right().length(1.8))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Capacitor().down())
    d.add(elm.Dot())
    d.pop()
    d.add(elm.Line().right().length(1.6))
    d.add(elm.Resistor().down())
    d.add(elm.Line().left().length(3.4))
finish(axs[3], d, (-2.7, 4.4), (-1.2, 3.6))
src_label(axs[3], "$i_{in}(t)$")
axs[3].text(1.3, 1.5, "$C$", ha="right", va="center", fontsize=FS)
axs[3].text(3.95, 1.5, "$R$", ha="left", va="center", fontsize=FS)

for ax, lab in zip(axs, ["(a)", "(b)", "(c)", "(d)"]):
    ax.text(0.5, 0.02, lab, transform=ax.transAxes, ha="center", va="bottom", fontsize=FS)
fig.tight_layout()
fig.savefig("pe04_q4_connect.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
print("pe04_q1_circuit.png pe04_q2_circuit.png pe04_q3_rlc.png pe04_q4_connect.png")
