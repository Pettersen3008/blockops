import { PRODUCT_NAME } from "@/config";

export function AppBrand() {
  return (
    <div className="brand" aria-label={PRODUCT_NAME}>
      <span className="brand__mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <span>{PRODUCT_NAME}</span>
    </div>
  );
}
