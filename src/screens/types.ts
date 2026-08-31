import type { DbApi } from '../useDb';
import type { ISODate } from '../types';

export type ScreenProps = {
  store: DbApi;
  /** התאריך המקומי של עכשיו, מתעדכן בזמן ריצה. */
  today: ISODate;
};
