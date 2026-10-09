import ProductForm, { EMPTY_PRODUCT } from "../ProductForm";

export default function NewProductPage() {
  return <ProductForm initial={EMPTY_PRODUCT} />;
}