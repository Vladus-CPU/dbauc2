export const state = {
  items: [],
  page: 1,
  perPage: 24,
  query: '',
  filterUnit: '',
  sortBy: 'newest',
};

export function setQuery(q) { 
    state.query = q; 
    state.page = 1; 
}
export function setFilterUnit(u) { 
    state.filterUnit = u; 
    state.page = 1; 
}
export function setSortBy(v) 
{ state.sortBy = v; 

}
export function nextPage() {
     state.page++; 
    }
export function prevPage() { 
    if (state.page > 1) 
        state.page--; 
    }