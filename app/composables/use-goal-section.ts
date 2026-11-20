import type { ConvexClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { computed, onScopeDispose, ref, shallowReactive } from "vue";
import { api } from "../../convex/_generated/api";

type SectionArgs = FunctionArgs<typeof api.goals.listSection>;
type SectionResult = FunctionReturnType<typeof api.goals.listSection>;

type Page = {
  cursor: string | null;
  endCursor?: string;
  result?: SectionResult;
  unsubscribe?: () => void;
};

const PAGE_SIZE = 25;

export function useGoalSection(client: ConvexClient, status: SectionArgs["status"]) {
  const pages = shallowReactive<Page[]>([]);
  const error = ref("");
  const pending = ref(false);

  function subscribe(page: Page) {
    page.unsubscribe?.();
    page.unsubscribe = client.onUpdate(
      api.goals.listSection,
      {
        status,
        paginationOpts: {
          numItems: PAGE_SIZE,
          cursor: page.cursor,
          ...(page.endCursor === undefined ? {} : { endCursor: page.endCursor }),
        },
      },
      (result) => {
        page.result = result;
        if (page === pages.at(-1)) pending.value = false;
      },
      (cause) => {
        error.value = cause.message;
        pending.value = false;
      },
    );
  }

  function startPage(cursor: string | null) {
    const page = shallowReactive<Page>({ cursor });
    pages.push(page);
    pending.value = true;
    subscribe(page);
  }

  function clearPages() {
    for (const page of pages) page.unsubscribe?.();
    pages.length = 0;
  }

  const lastResult = computed(() => pages.at(-1)?.result);
  const canLoadMore = computed(() => lastResult.value?.isDone === false);

  function loadMore() {
    const page = pages.at(-1);
    if (pending.value || error.value || !page?.result || page.result.isDone) return;

    // Freeze the previous page at its continuation so reactive inserts or
    // removals cannot move rows across a seam we already loaded.
    const cursor = page.result.continueCursor;
    page.endCursor = cursor;
    subscribe(page);
    startPage(cursor);
  }

  function retry() {
    clearPages();
    error.value = "";
    startPage(null);
  }

  startPage(null);
  onScopeDispose(clearPages, true);

  return {
    items: computed(() => pages.flatMap((page) => page.result?.page ?? [])),
    isInitialLoading: computed(() => pending.value && pages.length === 1),
    isLoadingMore: computed(() => pending.value && pages.length > 1),
    canLoadMore,
    error,
    loadMore,
    retry,
  };
}
