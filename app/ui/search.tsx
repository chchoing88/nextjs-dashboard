"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";

export default function Search({ placeholder }: { placeholder: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleSearch = useDebouncedCallback((term: string) => {
    // URLSearchParams - 웹 API로 쿼리 파라미터 조작 유틸리티
    const params = new URLSearchParams(searchParams);
    params.set("page", "1"); // 검색시 페이지를 1로 리셋

    if (term) {
      params.set("query", term);
    } else {
      params.delete("query");
    }

    // 페이지 새로고침 없이 URL 업데이트 (클라이언트 사이드 네비게이션)
    replace(`${pathname}?${params.toString()}`);
  }, 300); // 일반적인 디바운스 딜레이 값

  return (
    <div className="relative flex flex-1 flex-shrink-0">
      <label htmlFor="search" className="sr-only">
        Search
      </label>
      <input
        defaultValue={searchParams.get("query")?.toString()}
        onChange={(e) => {
          handleSearch(e.target.value);
        }}
        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
        placeholder={placeholder}
      />
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
    </div>
  );
}
