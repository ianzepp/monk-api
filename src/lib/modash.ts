
// Return the first item of an array, or a default value
export function head<T>(r: T[], defaultValue: T | null | undefined = null) {
    return r[0] || defaultValue;
}

export default {
    head,
}
