/** 司令部・集積所。道路ノードに置かれ、大きな備蓄を持つ。敵に押さえられると奪われる */
export interface Depot {
  id: string;
  side: string;
  nodeId: string;
  ammoT: number;
  fuelT: number;
}
