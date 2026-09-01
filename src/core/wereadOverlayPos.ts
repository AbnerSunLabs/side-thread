export type BoxEdge = {
  top: number;
  left: number;
  bottom: number;
};

export type ScrollerBox = BoxEdge & {
  scrollTop: number;
  scrollLeft: number;
};

/** 把锚点视口坐标换成滚动容器内的 absolute 坐标，滚动时才会跟着走。 */
export function overlayPosInScroller(
  scroller: ScrollerBox,
  anchor: BoxEdge,
): { top: number; left: number } {
  return {
    top: anchor.bottom - scroller.top + scroller.scrollTop,
    left: anchor.left - scroller.left + scroller.scrollLeft,
  };
}
