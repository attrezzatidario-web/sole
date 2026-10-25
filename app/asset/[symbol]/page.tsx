import AssetView from "@/components/AssetView";
import { ASSETS } from "@/lib/domain/correlations";

// Sito statico: le pagine dei 21 asset vengono generate in fase di build.
export const dynamicParams = false;

export function generateStaticParams() {
  return ASSETS.map((a) => ({ symbol: a.symbol }));
}

export default function AssetPage({ params }: { params: { symbol: string } }) {
  return <AssetView symbol={decodeURIComponent(params.symbol).toUpperCase()} />;
}
