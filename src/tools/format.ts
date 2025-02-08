// import statusMap from '../sMap';
import { $t } from '../i18n';

const statusMap = {
    liveStatus: {
        0: 'TEXT_CODE_105e14c8',
        1: 'TEXT_CODE_04657494',
        2: 'TEXT_CODE_0fef9c64'
    },
    recStatus: {
        0: 'TEXT_CODE_c357be15',
        1: 'TEXT_CODE_836534f1',
        2: 'TEXT_CODE_41f477dc'
    }
}

type StatusType = keyof typeof statusMap;
type StatusCode<T extends StatusType> = keyof typeof statusMap[T];

export function statusToString<T extends StatusType>(type: T, status: StatusCode<T>) {
    return $t(statusMap[type][status] as string);
}
