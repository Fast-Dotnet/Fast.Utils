// 本文件只参与 TypeScript 编译，用于验证消费者可见的公开 API 和预期类型错误。
import { defineComponent, h, shallowRef } from "vue";
import {
	AESDecrypt,
	AESEncrypt,
	type DecodedText,
	GenerateRSAKeyPair,
	Local,
	MD5Encrypt,
	Session,
	type StorageArea,
	chunk,
	cloneDeep,
	configureInstallationIdentity,
	configureLogger,
	configureStorage,
	copy,
	decodeSecureBase64,
	encodeSecureBase64,
	formatChineseRelativeTime,
	groupBy,
	isEqual,
	logger,
	makeSlots,
	mapConcurrent,
	omit,
	omitBy,
	once,
	parseQueryString,
	pick,
	pickBy,
	randomInt,
	randomString,
	retry,
	serializeStyle,
	symmetricDifference,
	useBreakpoints,
	useElementSize,
	useEmits,
	useEventListener,
	useNow,
	useProps,
	useRender,
	useResizeObserver,
	useTransition,
	useWindowSize,
	withDefineType,
} from "@fast-china/utils";
import type { ComputedRef } from "vue";

const transitioned = useTransition(shallowRef(0), { duration: 500, transition: (progress) => progress ** 2 });
const transitionedNumber: number = transitioned.value;
useTransition(() => 10);
useTransition(10);
// @ts-expect-error 过渡值只读
transitioned.value = 1;
// @ts-expect-error 仅支持数值
useTransition(shallowRef("10"));
// @ts-expect-error 缓动必须返回数值
useTransition(0, { transition: () => "1" });
export { transitionedNumber };

type Equal<Left, Right> = [Left, Right] extends [Right, Left] ? true : false;
type Expect<Value extends true> = Value;

const chunks = chunk([1, 2, 3] as const, 2);
type ChunkResult = Expect<Equal<typeof chunks, (1 | 2 | 3)[][]>>;

const grouped = groupBy(
	[
		{ kind: "a" as const, value: 1 },
		{ kind: "b" as const, value: 2 },
	],
	(item) => item.kind
);
const groupedCheck: Map<"a" | "b", { kind: "a" | "b"; value: number }[]> = grouped;

const selected = pick({ count: 1, label: "fast" }, ["label"]);
type PickResult = Expect<Equal<typeof selected, { label: string }>>;

const dynamicKeys: string[] = ["label"];
const dynamicallySelected = pick({ count: 1, label: "fast" }, dynamicKeys);
const dynamicallyOmitted = omit({ count: 1, label: "fast" }, dynamicKeys);
type DynamicPickResult = Expect<Equal<typeof dynamicallySelected, Partial<{ count: number; label: string }>>>;
type DynamicOmitResult = Expect<Equal<typeof dynamicallyOmitted, Partial<{ count: number; label: string }>>>;

const cloned = cloneDeep({ nested: { id: 1 } });
type CloneDeepResult = Expect<Equal<typeof cloned, { nested: { id: number } }>>;

const equalityResult: boolean = isEqual({ id: 1 }, { id: 1 });
const pickedBy = pickBy({ count: 1, label: "fast" }, (value) => typeof value === "number");
const omittedBy = omitBy({ count: 1, label: "fast" }, (value) => typeof value === "number");
type PickByResult = Expect<Equal<typeof pickedBy, Partial<{ count: number; label: string }>>>;
type OmitByResult = Expect<Equal<typeof omittedBy, Partial<{ count: number; label: string }>>>;

const symmetric = symmetricDifference([1, 2] as const, [2, 3] as const);
type SymmetricDifferenceResult = Expect<Equal<typeof symmetric, (1 | 2 | 3)[]>>;

const initializeOnce = once((value: number) => String(value));
const onceResult: string = initializeOnce(1);

const retried = retry(({ attempt }) => (attempt > 1 ? "done" : Promise.reject(new Error("retry"))));
const retryCheck: Promise<string> = retried;

const concurrent = mapConcurrent([1, 2], 2, (value) => Promise.resolve(String(value)));
type ConcurrentResult = Expect<Equal<typeof concurrent, Promise<string[]>>>;

const md5Digest: string = MD5Encrypt("Fast");
const inlineStyle: string = serializeStyle({ fontSize: "14px" });
const dateText: string = formatChineseRelativeTime(Date.now());
const encryptedJson = AESEncrypt(JSON.stringify({ id: 1 }), "key", "vector");
const decryptedJson: { id: number } | null = AESDecrypt(encryptedJson ?? "", "key", "vector")?.parseJson<{ id: number }>() ?? null;
const rsaKeys: Promise<{ privateKey: string; publicKey: string }> = GenerateRSAKeyPair();
const decodedText: DecodedText = decodeSecureBase64(encodeSecureBase64("Fast"));
const secureBase64Text: string = decodedText;
const secureBase64Json: { id: number } = decodeSecureBase64(encodeSecureBase64('{"id":1}')).parseJson<{ id: number }>();
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 验证未传泛型时公共 API 默认返回 any。
const inferredAnyJson = decodeSecureBase64(encodeSecureBase64('{"id":1}')).parseJson();
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- any 应允许调用方直接读取预期字段。
const uncheckedJsonId: number = inferredAnyJson.id;

configureStorage({ prefix: "type-test:" });
configureInstallationIdentity({ cacheKey: "identity:installation-id" });
configureLogger({ uniAppPlusSplit: true });
logger.log("Launch", { code: 200 });
logger.log("Launch", "ready", { code: 200 });
logger.log("Launch");
Local.set("single-crypto", { id: 1 }, { crypto: true });
const singleCryptoValue = Local.get<{ id: number }>("single-crypto", { crypto: true });
const localStorageArea: StorageArea = Local;
const sessionStorageArea: StorageArea = Session;
const defaultStored = Local.get("plain-item");
type DefaultStorageResult = Expect<Equal<typeof defaultStored, string | undefined>>;
const stored = Local.get<{ id: number }>("item");
type StorageResult = Expect<Equal<typeof stored, { id: number } | undefined>>;

const query = parseQueryString("id=1");
const queryValue: string | string[] | undefined = query["id"];
// @ts-expect-error Query keys can be absent at runtime.
const requiredQueryValue: string | string[] = query["missing"];
const copyResult: Promise<void> = copy("Fast");
const randomInteger: number = randomInt(0, 10);
const randomText: string = randomString(16);

const eventTarget = shallowRef<EventTarget | null>(null);
const stopEventListener: () => void = useEventListener<CustomEvent<string>>(eventTarget, "change", (event) => event.detail.length);
const stopResizeObserver: () => void = useResizeObserver(null, () => undefined);
const elementSize = useElementSize(null, { height: 20, width: 10 });
const windowSize = useWindowSize();
const currentTime = useNow();
const responsive = useBreakpoints({ desktop: 1280, mobile: 0 });
const activeBreakpoint: ComputedRef<"desktop" | "mobile" | ""> = responsive.active();

const rawEmits = {
	clear: null,
	"update:modelValue": (_value: string) => true,
};
defineComponent({
	emits: rawEmits,
	props: {
		disabled: Boolean,
		modelValue: String,
	},
	setup(props, { emit }) {
		const handlers = useEmits(rawEmits, emit);
		const forwarded = useProps(props, { disabled: Boolean });
		const typedForwarded: ComputedRef<{ disabled: boolean }> = forwarded;
		handlers.value["onUpdate:modelValue"]?.("value");
		handlers.value.onClear?.();
		// @ts-expect-error The event payload is declared as a string.
		handlers.value["onUpdate:modelValue"]?.(1);
		useRender(() => h("div"));
		return { handlers, typedForwarded };
	},
});

const typedValue = withDefineType<{ id: number }>();
const slots = makeSlots<{ default: never; item: { id: number } }>();

defineComponent({
	slots,
	setup(_props, { slots: componentSlots }) {
		componentSlots.default?.();
		componentSlots.item?.({ id: 1 });
		// @ts-expect-error The item slot requires a numeric id.
		componentSlots.item?.({ id: "1" });
		return () => h("div");
	},
});

export {
	chunks,
	cloned,
	concurrent,
	copyResult,
	currentTime,
	dateText,
	defaultStored,
	decryptedJson,
	dynamicallyOmitted,
	dynamicallySelected,
	elementSize,
	equalityResult,
	groupedCheck,
	initializeOnce,
	inlineStyle,
	localStorageArea,
	md5Digest,
	omittedBy,
	onceResult,
	pickedBy,
	queryValue,
	randomInteger,
	randomText,
	responsive,
	requiredQueryValue,
	retryCheck,
	rsaKeys,
	secureBase64Json,
	secureBase64Text,
	selected,
	stopEventListener,
	stopResizeObserver,
	activeBreakpoint,
	windowSize,
	sessionStorageArea,
	singleCryptoValue,
	slots,
	stored,
	symmetric,
	typedValue,
	uncheckedJsonId,
};
export type {
	ChunkResult,
	CloneDeepResult,
	ConcurrentResult,
	DefaultStorageResult,
	DynamicOmitResult,
	DynamicPickResult,
	OmitByResult,
	PickByResult,
	PickResult,
	StorageResult,
	SymmetricDifferenceResult,
};

// 动态联合键数组不保证所有键都被选择或排除。
const dynamicReviewKeys: ("a" | "b")[] = ["a"];
const dynamicReviewPick = pick({ a: 1, b: 2, c: 3 }, dynamicReviewKeys);
const dynamicReviewOmit = omit({ a: 1, b: 2, c: 3 }, dynamicReviewKeys);
const dynamicReviewValue: number | undefined = dynamicReviewPick.b;
const retainedReviewValue: number = dynamicReviewOmit.c;
// @ts-expect-error 动态数组中包含某类键，不代表运行时一定选择了该键。
const requiredReviewValue: number = dynamicReviewPick.b;
// @ts-expect-error 动态数组不保证 a 已经删除。
const removedReviewValue: undefined = dynamicReviewOmit.a;
export { dynamicReviewValue, retainedReviewValue, requiredReviewValue, removedReviewValue };
