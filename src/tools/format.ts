// import statusMap from '../sMap';
import { $t } from '../i18n';

const statusMap = {
    liveStatus: {
        0: 'TEXT_CODE_status.live_0',
        1: 'TEXT_CODE_status.live_1',
        2: 'TEXT_CODE_status.live_2'
    },
    recStatus: {
        0: 'TEXT_CODE_status.rec_0',
        1: 'TEXT_CODE_status.rec_1',
        2: 'TEXT_CODE_status.rec_2'
    }
}

type StatusType = keyof typeof statusMap;
type StatusCode<T extends StatusType> = keyof typeof statusMap[T];

export function statusToString<T extends StatusType>(type: T, status: StatusCode<T>) {
    return $t(statusMap[type][status] as string);
}
