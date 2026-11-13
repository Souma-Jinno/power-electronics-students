"""第5回 演習問題の図（学生ページ exercises/05.html で使う）。

  pe05_q1_buck.png      : 問題1。降圧チョッパー回路（スライド p15 と同じ配置・記号）
  pe05_q3_boost.png     : 問題3。昇圧チョッパー回路（スライド p35〜p36）
  pe05_q4_buckboost.png : 問題4。昇降圧チョッパー回路（スライド p38）

回路の描き方は第5回スライドに合わせてある（制御スイッチは点線の箱、i_L 青・v_L 赤・
v_R と v_C 緑・i_D 橙・i_C 紫）。スライドの v_sw はスイッチを切り替える信号（ゲートの信号）で、スイッチの両端の電圧ではないので、問題の図には入れていない（draw_buck(vsw=True) で出せる）。
再生成： python3 gen_pe05_figs.py

2026-10-23 講義の内容だけで解けるようにするため、問題2の
シミュレーションの波形の図（pe05_q2_sim.png）は使わなくなったので、ここでは作らない（古い png は消さずに残してある）。
"""
import numpy as np
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
GREEN = "#1a9a3a"
PURPLE = "#8e44ef"
MAGENTA = "#e33ad6"
GRAY = "0.45"
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


def switch(d, start, end, state):
    """制御スイッチ。state=None は開いた絵（問題用）、'on' は閉じた絵、'off' は開いた絵。"""
    if state == "on":
        # 閉じたスイッチ：端子の丸2つを1本の線でつないだ絵（schemdraw の nc は開いた絵と見分けにくい）
        (x0, y0), (x1, y1) = start, end
        d.add(elm.Line().endpoints(start, end))
        cs = [(x0 + (x1 - x0) * r, y0 + (y1 - y0) * r) for r in (0.36, 0.64)]
        for c in cs:
            d.add(elm.Dot(open=True, radius=0.13).at(c))
        d.add(elm.Line().endpoints(*cs).zorder(10))     # 閉じたレバー（丸の上に描く）
        return None
    return d.add(elm.Switch().endpoints(start, end))


def sw_box(ax, x0, y0, x1, y1):
    ax.plot([x0, x1, x1, x0, x0], [y0, y0, y1, y1, y0], ls=":", color="k", lw=1.2)


def loop(ax, pts, color=GRAY, lw=4.0, arrows=(), frac=0.5):
    """電流の経路（灰色の太線）。pts は角の点。arrows は矢印を置く辺の番号、frac は辺のどこに置くか。"""
    xs = [p[0] for p in pts] + [pts[0][0]]
    ys = [p[1] for p in pts] + [pts[0][1]]
    ax.plot(xs, ys, color=color, lw=lw, alpha=0.75, solid_joinstyle="round", solid_capstyle="round", zorder=5)
    for k in arrows:
        (xa, ya), (xb, yb) = pts[k], pts[(k + 1) % len(pts)]
        xm, ym = xa + (xb - xa) * frac, ya + (yb - ya) * frac
        dx, dy = (xb - xa) * 0.06, (yb - ya) * 0.06
        n = np.hypot(dx, dy)
        dx, dy = dx / n * 0.25, dy / n * 0.25
        ax.annotate("", xy=(xm + dx, ym + dy), xytext=(xm - dx, ym - dy),
                    arrowprops=dict(arrowstyle="-|>", color=color, lw=0, mutation_scale=26, alpha=0.9),
                    zorder=6)


# ---------------------------------------------------------------- 降圧チョッパー
def draw_buck(ax, state=None, labels=True, vsw=False):
    """V0 → 制御スイッチ → (ダイオード) → L → R。座標：下の線 y=0、上の線 y=3。
    ダイオードは x=4.2、L は x=4.8〜7.6、R は x=8.4。"""
    with schemdraw.Drawing(show=False) as d:
        d.add(elm.Battery().endpoints((0, 0), (0, 3)).reverse())
        d.add(elm.Line().endpoints((0, 3), (1.2, 3)))
        switch(d, (1.2, 3), (3.0, 3), state)
        d.add(elm.Line().endpoints((3.0, 3), (4.8, 3)))
        d.add(elm.Dot().at((4.2, 3)))
        d.add(elm.Diode().endpoints((4.2, 0), (4.2, 3)))
        d.add(elm.Dot().at((4.2, 0)))
        d.add(elm.Inductor2(loops=3).endpoints((4.8, 3), (7.6, 3)))
        d.add(elm.Line().endpoints((7.6, 3), (8.4, 3)))
        d.add(elm.Resistor().endpoints((8.4, 3), (8.4, 0)))
        d.add(elm.Line().endpoints((8.4, 0), (0, 0)))
    finish(ax, d, (-1.9, 10.6), (-0.7, 5.0))
    if state is None:
        sw_box(ax, 1.1, 2.55, 3.1, 3.75)
    ax.text(-0.75, 1.5, "$V_0$", ha="right", va="center", fontsize=FS)
    arrow(ax, -0.55, 0.7, -0.55, 2.3)
    if not labels:
        return
    ax.text(6.2, 2.45, "$L$", ha="center", va="top", fontsize=FS)
    ax.text(7.85, 1.5, "$R$", ha="right", va="center", fontsize=FS)
    arrow(ax, 9.0, 0.7, 9.0, 2.3, GREEN)
    ax.text(9.2, 1.5, "$v_R$", ha="left", va="center", fontsize=FS)
    arrow(ax, 4.9, 3.6, 5.8, 3.6, BLUE)
    ax.text(5.35, 3.75, "$i_L$", ha="center", va="bottom", fontsize=FS)
    arrow(ax, 7.3, 4.2, 6.2, 4.2, RED)
    ax.text(6.75, 4.3, "$v_L$", ha="center", va="bottom", fontsize=FS)
    arrow(ax, 4.75, 0.8, 4.75, 2.0, ORANGE)
    ax.text(4.95, 1.35, "$i_D$", ha="left", va="center", fontsize=FS)
    if vsw:
        arrow(ax, 1.5, 2.15, 2.7, 2.15, MAGENTA)
        ax.text(2.1, 2.0, "$v_\\mathrm{sw}$", ha="center", va="top", fontsize=FS)


# ---------------------------------------------------------------- 昇圧チョッパー
def draw_boost(ax, state=None, labels=True):
    """V0 → L → 節点 A（x=4.0）→ ダイオード → C ∥ R。制御スイッチは A と下の線の間。"""
    with schemdraw.Drawing(show=False) as d:
        d.add(elm.Battery().endpoints((0, 0), (0, 3)).reverse())
        d.add(elm.Line().endpoints((0, 3), (0.6, 3)))
        d.add(elm.Inductor2(loops=3).endpoints((0.6, 3), (3.4, 3)))
        d.add(elm.Line().endpoints((3.4, 3), (4.4, 3)))
        d.add(elm.Dot().at((4.0, 3)))
        switch(d, (4.0, 3), (4.0, 0), state)
        d.add(elm.Dot().at((4.0, 0)))
        d.add(elm.Diode().endpoints((4.4, 3), (6.6, 3)))
        d.add(elm.Line().endpoints((6.6, 3), (9.4, 3)))
        d.add(elm.Dot().at((7.4, 3)))
        d.add(elm.Capacitor().endpoints((7.4, 3), (7.4, 0)))
        d.add(elm.Dot().at((7.4, 0)))
        d.add(elm.Resistor().endpoints((9.4, 3), (9.4, 0)))
        d.add(elm.Line().endpoints((9.4, 0), (0, 0)))
    finish(ax, d, (-1.9, 11.4), (-0.7, 5.0))
    if state is None:
        sw_box(ax, 3.45, 0.55, 4.6, 2.45)
    ax.text(-0.75, 1.5, "$V_0$", ha="right", va="center", fontsize=FS)
    arrow(ax, -0.55, 0.7, -0.55, 2.3)
    if not labels:
        return
    ax.text(2.0, 2.45, "$L$", ha="center", va="top", fontsize=FS)
    arrow(ax, 0.1, 3.6, 1.0, 3.6, BLUE)
    ax.text(0.55, 3.75, "$i_L$", ha="center", va="bottom", fontsize=FS)
    arrow(ax, 3.0, 4.2, 1.9, 4.2, RED)
    ax.text(2.45, 4.3, "$v_L$", ha="center", va="bottom", fontsize=FS)
    arrow(ax, 4.9, 3.75, 6.1, 3.75, ORANGE)
    ax.text(5.5, 3.9, "$i_D$", ha="center", va="bottom", fontsize=FS)
    ax.text(6.85, 1.5, "$C$", ha="right", va="center", fontsize=FS)
    arrow(ax, 7.95, 2.2, 7.95, 0.8, PURPLE)
    ax.text(8.1, 1.0, "$i_C$", ha="left", va="center", fontsize=FS)
    ax.text(8.85, 2.1, "$R$", ha="right", va="center", fontsize=FS)
    arrow(ax, 10.0, 0.7, 10.0, 2.3, GREEN)
    ax.text(10.2, 1.5, "$v_C$", ha="left", va="center", fontsize=FS)


# ---------------------------------------------------------------- 昇降圧チョッパー
def draw_buckboost(ax, state=None, labels=True):
    """V0 → 制御スイッチ → 節点 A（x=4.2）。A から L が下へ、ダイオード（カソードが A 側）を通って C ∥ R。"""
    with schemdraw.Drawing(show=False) as d:
        d.add(elm.Battery().endpoints((0, 0), (0, 3)).reverse())
        d.add(elm.Line().endpoints((0, 3), (1.2, 3)))
        switch(d, (1.2, 3), (3.0, 3), state)
        d.add(elm.Line().endpoints((3.0, 3), (4.8, 3)))
        d.add(elm.Dot().at((4.2, 3)))
        d.add(elm.Inductor2(loops=3).endpoints((4.2, 3), (4.2, 0)))
        d.add(elm.Dot().at((4.2, 0)))
        d.add(elm.Diode().endpoints((7.0, 3), (4.8, 3)))
        d.add(elm.Line().endpoints((7.0, 3), (9.6, 3)))
        d.add(elm.Dot().at((7.6, 3)))
        d.add(elm.Capacitor().endpoints((7.6, 3), (7.6, 0)))
        d.add(elm.Dot().at((7.6, 0)))
        d.add(elm.Resistor().endpoints((9.6, 3), (9.6, 0)))
        d.add(elm.Line().endpoints((9.6, 0), (0, 0)))
    finish(ax, d, (-1.9, 11.6), (-0.7, 5.0))
    if state is None:
        sw_box(ax, 1.1, 2.55, 3.1, 3.75)
    ax.text(-0.75, 1.5, "$V_0$", ha="right", va="center", fontsize=FS)
    arrow(ax, -0.55, 0.7, -0.55, 2.3)
    if not labels:
        return
    ax.text(3.55, 2.2, "$L$", ha="right", va="center", fontsize=FS)
    arrow(ax, 3.25, 1.9, 3.25, 0.6, BLUE)
    ax.text(3.1, 1.0, "$i_L$", ha="right", va="center", fontsize=FS)
    arrow(ax, 5.15, 0.6, 5.15, 2.2, RED)
    ax.text(5.3, 1.3, "$v_L$", ha="left", va="center", fontsize=FS)
    ax.text(7.05, 1.5, "$C$", ha="right", va="center", fontsize=FS)
    ax.text(9.05, 2.1, "$R$", ha="right", va="center", fontsize=FS)
    arrow(ax, 10.2, 0.7, 10.2, 2.3, GREEN)
    ax.text(10.4, 1.5, "$v_C$", ha="left", va="center", fontsize=FS)


if __name__ == "__main__":
    # ================= 問題1：降圧チョッパー =================
    fig, ax = plt.subplots(figsize=(7.4, 3.6))
    draw_buck(ax)
    fig.tight_layout()
    fig.savefig("pe05_q1_buck.png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)

    # ================= 問題3：昇圧チョッパー =================
    fig, ax = plt.subplots(figsize=(7.8, 3.6))
    draw_boost(ax)
    fig.tight_layout()
    fig.savefig("pe05_q3_boost.png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)

    # ================= 問題4：昇降圧チョッパー =================
    fig, ax = plt.subplots(figsize=(7.8, 3.6))
    draw_buckboost(ax)
    fig.tight_layout()
    fig.savefig("pe05_q4_buckboost.png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("pe05_q1_buck.png pe05_q3_boost.png pe05_q4_buckboost.png")
