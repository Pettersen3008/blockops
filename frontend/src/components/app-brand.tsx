import { PRODUCT_NAME } from "@/config";

export function AppBrand() {
  return (
    <div className="inline-flex items-center gap-2.5 text-[1.08rem] font-bold tracking-[-0.03em]" aria-label={PRODUCT_NAME}>
      <span className="grid size-[30px] rotate-[1deg] grid-cols-2 gap-0.5" aria-hidden="true"><i className="rounded-tl-md rounded-tr-sm bg-primary" /><i className="rounded-tl-sm rounded-tr-md rounded-br-sm bg-primary opacity-75" /><i className="rounded-tl-sm rounded-bl-md rounded-br-sm bg-primary opacity-55" /><i className="rounded-tl-sm rounded-tr-sm rounded-br-md bg-primary" /></span>
      <span>{PRODUCT_NAME}</span>
    </div>
  );
}
